"""E05 shared reservations. Caller owns the short transaction; never perform IO here.

All writers take the project barrier. Ledger rows, not checkpoints or usage
snapshots, are authoritative. Unknown dispatches retain their entire reservation.
"""
from copy import deepcopy
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, model_validator
from sqlalchemy import select

from .agent_db import ReservationRow, UsageRow, AssignmentRow
from .agent_runs import RunService, TERMINAL, key_check
from .contract_core import ContractModel, Counter, Identifier, Digest
from .contracts import now, uid
from .errors import DomainError
from .research_contracts import UsageSnapshot, SpecialistAssignment

CATEGORIES = frozenset({"input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"})


class Resources(ContractModel):
    model_tokens: Counter = 0
    model_requests: Counter = 0
    tool_calls: Counter = 0
    scientific_attempts: Counter = 0
    active_seconds: Counter = 0
    coordinator_iterations: Counter = 0
    specialist_assignments: Counter = 0
    review_rounds: Counter = 0
    transient_retries: Counter = 0


class Pricing(ContractModel):
    """Trusted versioned USD rates per token, never provider/model-generated prices."""
    revision: Identifier
    model: Identifier
    effective_at: AwareDatetime
    currency: Literal["USD"] = "USD"
    rates: dict[str, Decimal]

    @model_validator(mode="after")
    def valid_rates(self):
        if set(self.rates) != CATEGORIES or any(not n.is_finite() or n < 0 for n in self.rates.values()):
            raise ValueError("Pricing requires every billed category and finite nonnegative rates")
        if self.effective_at > now():
            raise ValueError("Pricing is not yet effective")
        return self


class ReservationIntent(ContractModel):
    version: Literal["e05.v1"] = "e05.v1"
    kind: Literal["operation", "allocation"] = "operation"
    request_sha256: Digest
    resources: Resources
    assignment_id: Identifier | None = None
    finalization: bool = False
    model: Identifier | None = None
    pricing: Pricing | None = None
    control_revision: Counter
    claim_token: Counter


def denied(message, code="BUDGET_EXHAUSTED"):
    raise DomainError(message, 409, code)


def add(a, b):
    return {key: a[key] + b[key] for key in Resources.model_fields}


def cost_bound(intent):
    if not intent.resources.model_tokens:
        return Decimal(0)
    if intent.pricing is None:
        return None
    return max(intent.pricing.rates.values()) * intent.resources.model_tokens


def records(s, pid, *, strict=True):
    rows = s.scalars(select(ReservationRow).where(ReservationRow.project_id == pid)).all()
    # Legacy B11 placeholders carry no enforceable bound. Fail closed, not zero.
    if strict and any(r.payload.get("intent", {}).get("version") != "e05.v1" for r in rows):
        denied("Legacy usage reservations require trusted reconciliation")
    rows = [r for r in rows if r.payload.get('intent', {}).get('version') == 'e05.v1']
    # request_id is unique within a run, not across the project.
    entries = {(r.run_id, r.request_id): r.payload for r in s.scalars(select(UsageRow).where(UsageRow.project_id == pid))}
    if strict and any(e.get("version") != "e05.v1" for e in entries.values()):
        denied("Legacy usage entries require trusted reconciliation")
    entries = {k: e for k, e in entries.items() if e.get('version') == 'e05.v1'}
    from .agent_db import RunJobRow
    identities = {(r.run_id, r.request_id) for r in rows}
    if strict and any((link.run_id, 'job:' + link.action_id) not in identities for link in s.scalars(
            select(RunJobRow).where(RunJobRow.project_id == pid))):
        denied("Legacy scientific usage requires trusted reconciliation")
    return rows, entries


def charged(row, entries):
    entry = entries.get((row.run_id, row.request_id))
    if entry:
        return entry["resources"], Decimal(entry["cost_usd"]) if entry["cost_usd"] is not None else None
    intent = ReservationIntent.model_validate(row.payload["intent"])
    return intent.resources.model_dump(), cost_bound(intent)


def totals(rows, entries, *, rid=None, assignment_id=None, ordinary=False):
    selected = [r for r in rows if (rid is None or r.run_id == rid)
                and (assignment_id is None or r.assignment_id == assignment_id)]
    result, money = Resources().model_dump(), Decimal(0)
    allocations = {(r.run_id, r.assignment_id): r for r in selected
                   if r.payload["intent"]["kind"] == "allocation"}
    for row in selected:
        intent = row.payload["intent"]
        if ordinary and intent["finalization"]:
            continue
        if intent["kind"] == "allocation":
            if assignment_id is not None:
                continue
            if row.payload["state"] == "released":
                result["specialist_assignments"] += intent["resources"]["specialist_assignments"]
                continue
            # Children consume this slice; they do not add another parent charge.
            amount, cost = charged(row, entries)
        else:
            allocation = allocations.get((row.run_id, row.assignment_id))
            if assignment_id is None and allocation and allocation.payload["state"] != "released":
                continue
            amount, cost = charged(row, entries)
        result = add(result, amount)
        money = None if money is None or cost is None else money + cost
    return result, money


class BudgetService:
    def __init__(self, runs=None):
        self.runs = runs or RunService()

    def reserve(self, s, pid, rid, request_id, resources: Resources, *, request_sha256,
                expected_revision, claim_token, assignment_id=None, finalization=False,
                model=None, pricing=None, allocation=False):
        key_check(request_id)
        resources = Resources.model_validate(resources)
        row = self.runs.get(s, pid, rid, lock=True)
        intent = ReservationIntent(request_sha256=request_sha256, resources=resources,
            kind="allocation" if allocation else "operation", assignment_id=assignment_id,
            finalization=finalization, model=model, pricing=pricing,
            control_revision=expected_revision, claim_token=claim_token)
        data = intent.model_dump(mode="json")
        old = s.scalar(select(ReservationRow).where(ReservationRow.run_id == rid, ReservationRow.request_id == request_id))
        if old:
            if old.payload.get("intent") != data:
                denied("Request ID binds a different reservation", "IDEMPOTENCY_CONFLICT")
            return old
        self._authority(s, row, intent)
        rows, entries = records(s, pid)
        if any(e["overrun"] for e in entries.values()):
            denied("Observed usage exceeded its trusted bound; spending is fenced")
        effective = self.runs.effective_policy(s, row)
        server, project = self.runs.policies(s, pid)
        from .agent_policy import intersect_policy
        project = intersect_policy(server, project)
        if resources.model_tokens and not allocation and (resources.model_requests != 1 or model is None):
            denied("Model reservations require one request and a model", "VALIDATION_FAILED")
        if resources.model_requests and not resources.model_tokens:
            denied("Model calls require a nonzero conservative token bound", "VALIDATION_FAILED")
        if model is not None and model not in effective.provider_models:
            denied("Model is outside current policy", "POLICY_DENIED")
        if pricing is not None and pricing.model != model:
            denied("Pricing model differs from reserved model", "VALIDATION_FAILED")
        if allocation and (not assignment_id or finalization):
            denied("Specialist allocation requires an assignment", "VALIDATION_FAILED")
        if resources.specialist_assignments != (1 if allocation else 0):
            denied("Each specialist allocation consumes one assignment", "VALIDATION_FAILED")
        if assignment_id:
            assignment = s.get(AssignmentRow, assignment_id)
            if not assignment or assignment.run_id != rid or assignment.project_id != pid:
                denied("Assignment does not belong to run", "REFERENCE_INVALID")
            typed = SpecialistAssignment.model_validate(assignment.payload)
            if assignment.state not in {"queued", "running", "waiting"} or typed.deadline_at <= now() or finalization:
                denied("Assignment cannot spend in its current state", "POLICY_DENIED")
            allocations = [r for r in rows if r.run_id == rid and r.assignment_id == assignment_id
                           and r.payload["intent"]["kind"] == "allocation"]
            if allocation:
                if allocations or request_id != typed.budget_allocation_id:
                    denied("Assignment already allocated or allocation ID differs", "IDEMPOTENCY_CONFLICT")
                active = sum(r.run_id == rid and r.payload["intent"]["kind"] == "allocation"
                             and r.payload["state"] == "reserved" for r in rows)
                project_active = sum(r.payload["intent"]["kind"] == "allocation"
                                     and r.payload["state"] == "reserved" for r in rows)
                if (active >= effective.limits.specialist_concurrency or effective.limits.delegation_depth == 0
                        or project_active >= project.limits.specialist_concurrency):
                    denied("Specialist concurrency or depth allowance exhausted")
            else:
                if len(allocations) != 1 or allocations[0].payload["state"] != "reserved":
                    denied("Assignment has no open budget allocation")
                ceiling = ReservationIntent.model_validate(allocations[0].payload["intent"])
                used, used_cost = totals(rows, entries, rid=rid, assignment_id=assignment_id)
                self._check(used, resources, ceiling.resources)
                cap = cost_bound(ceiling)
                if cap is not None and (used_cost is None or cost_bound(intent) is None or used_cost + cost_bound(intent) > cap):
                    denied("Assignment pricing exceeds its allocation")
        # A child uses its parent's pre-reserved slice; still check tightened policy.
        for policy, scope in ((project, None), (effective, rid)):
            used, used_cost = totals(rows, entries, rid=scope)
            ordinary, _ = totals(rows, entries, rid=scope, ordinary=True)
            increment = Resources() if assignment_id and not allocation else resources
            self._check(used, increment, policy.limits)
            if not finalization:
                for field in ("model_tokens", "scientific_attempts"):
                    if ordinary[field] + getattr(increment, field) > getattr(policy.limits, field) - getattr(policy.limits, "finalization_" + field):
                        denied("Ordinary work cannot consume finalization allowance")
            else:
                for field in ("model_tokens", "scientific_attempts"):
                    if used[field] - ordinary[field] + getattr(increment, field) > getattr(policy.limits, "finalization_" + field):
                        denied("Finalization exceeds its bounded allocation")
            if policy.spend_ceiling_usd is not None:
                extra = Decimal(0) if assignment_id and not allocation else cost_bound(intent)
                if used_cost is None or extra is None or used_cost + extra > Decimal(str(policy.spend_ceiling_usd)):
                    denied("A monetary ceiling requires known conservative pricing and remaining allowance")
        reservation = ReservationRow(id=uid(), project_id=pid, run_id=rid, assignment_id=assignment_id,
            request_id=request_id, payload={"intent": data, "state": "reserved"}, created_at=now())
        s.add(reservation)
        s.flush()
        self._refresh(s, row)
        return reservation

    @staticmethod
    def _check(used, request, limits):
        if any(used[k] + getattr(request, k) > getattr(limits, k) for k in Resources.model_fields):
            denied("Shared resource allowance exhausted")

    def _authority(self, s, row, intent):
        if (row.state in TERMINAL | {"paused", "waiting_for_input"} or row.payload["open_question_ids"]
                or row.control_revision != intent.control_revision or row.claim_token != intent.claim_token):
            denied("Run control fences new spending", "RUN_REVISION_CHANGED")

    def _get(self, s, pid, rid, request_id):
        run = self.runs.get(s, pid, rid, lock=True)
        reservation = s.scalar(select(ReservationRow).where(ReservationRow.run_id == rid,
            ReservationRow.request_id == request_id).execution_options(populate_existing=True))
        if not reservation:
            denied("Reservation not found in run", "REFERENCE_INVALID")
        return run, reservation

    def dispatch(self, s, pid, rid, request_id):
        """Commit before IO. False means never send again under this identity."""
        run, reservation = self._get(s, pid, rid, request_id)
        if reservation.payload["state"] != "reserved":
            return False
        intent = ReservationIntent.model_validate(reservation.payload["intent"])
        if intent.kind != "operation":
            denied("Allocations cannot be dispatched", "VALIDATION_FAILED")
        self._authority(s, run, intent)
        if intent.assignment_id:
            assignment = s.get(AssignmentRow, intent.assignment_id)
            if (not assignment or assignment.run_id != rid or assignment.project_id != pid
                    or assignment.state not in {"queued", "running", "waiting"}
                    or SpecialistAssignment.model_validate(assignment.payload).deadline_at <= now()):
                denied("Assignment cannot dispatch in its current state", "POLICY_DENIED")
        # Policy reductions after reserve must also fence dispatch.
        rows, entries = records(s, pid)
        if any(e["overrun"] for e in entries.values()):
            denied("Observed usage exceeded its trusted bound; spending is fenced")
        server, project = self.runs.policies(s, pid)
        from .agent_policy import intersect_policy
        for policy, scope in ((intersect_policy(server, project), None), (self.runs.effective_policy(s, run), rid)):
            used, money = totals(rows, entries, rid=scope)
            self._check(used, Resources(), policy.limits)
            ordinary, _ = totals(rows, entries, rid=scope, ordinary=True)
            for field in ('model_tokens', 'scientific_attempts'):
                if (ordinary[field] > getattr(policy.limits, field) - getattr(policy.limits, 'finalization_' + field)
                        or used[field] - ordinary[field] > getattr(policy.limits, 'finalization_' + field)):
                    denied("Current finalization allocation fences dispatch")
            if intent.model and intent.model not in policy.provider_models:
                denied("Model no longer permitted", "POLICY_DENIED")
            if policy.spend_ceiling_usd is not None and (money is None or money > Decimal(str(policy.spend_ceiling_usd))):
                denied("Monetary allowance no longer permits dispatch")
        reservation.payload = {**reservation.payload, "state": "unknown"}
        s.flush()
        self._refresh(s, run)
        return True

    def settle(self, s, pid, rid, request_id, resources: Resources, *, tokens=None):
        """Trusted measured usage; may settle after pause/cancel without rewriting terminal state."""
        resources = Resources.model_validate(resources)
        tokens = tokens or {}
        if set(tokens) - CATEGORIES or any(type(v) is not int or v < 0 for v in tokens.values()) or sum(tokens.values()) != resources.model_tokens:
            denied("Invalid billed token categories", "VALIDATION_FAILED")
        run, reservation = self._get(s, pid, rid, request_id)
        intent = ReservationIntent.model_validate(reservation.payload["intent"])
        if intent.kind != "operation":
            denied("Close allocations instead of settling them", "VALIDATION_FAILED")
        data = {"version": "e05.v1", "resources": resources.model_dump(), "tokens": tokens,
                "cost_usd": None if intent.pricing is None and intent.resources.model_tokens else
                    str(sum((intent.pricing.rates[k] * v for k, v in tokens.items()), Decimal(0))) if intent.pricing else "0",
                "pricing_revision": intent.pricing.revision if intent.pricing else None,
                "overrun": any(getattr(resources, k) > getattr(intent.resources, k) for k in Resources.model_fields)}
        old = s.scalar(select(UsageRow).where(UsageRow.run_id == rid, UsageRow.request_id == request_id))
        if old:
            if old.payload != data:
                denied("Conflicting settlement", "IDEMPOTENCY_CONFLICT")
            return old
        if reservation.payload["state"] != "unknown":
            denied("Only dispatched requests can settle", "VALIDATION_FAILED")
        # A dispatched call/attempt cannot be erased by an empty usage report.
        for k in ("model_requests", "tool_calls", "scientific_attempts", "transient_retries"):
            if getattr(resources, k) != getattr(intent.resources, k):
                denied("Settlement must retain dispatched call and attempt counters", "VALIDATION_FAILED")
        entry = UsageRow(id=uid(), project_id=pid, run_id=rid, assignment_id=reservation.assignment_id,
            request_id=request_id, payload=data, created_at=now())
        s.add(entry)
        reservation.payload = {**reservation.payload, "state": "settled"}
        s.flush()
        self._refresh(s, run)
        return entry

    def release(self, s, pid, rid, request_id):
        """Release only unissued work or unused specialist allocation."""
        run, reservation = self._get(s, pid, rid, request_id)
        if reservation.payload["state"] == "released":
            return
        if reservation.payload["state"] != "reserved":
            denied("Unknown or settled work cannot be released")
        if reservation.payload["intent"]["kind"] == "allocation":
            rows, _ = records(s, pid)
            if any(r.run_id == rid and r.assignment_id == reservation.assignment_id
                   and r.payload["intent"]["kind"] == "operation"
                   and r.payload["state"] in {"reserved", "unknown"} for r in rows):
                denied("Allocation has outstanding child reservations")
        if reservation.payload["intent"]["kind"] == "operation":
            data = {"version": "e05.v1", "resources": Resources().model_dump(), "tokens": {},
                    "cost_usd": "0", "pricing_revision": None, "overrun": False}
            s.add(UsageRow(id=uid(), project_id=pid, run_id=rid, assignment_id=reservation.assignment_id,
                request_id=request_id, payload=data, created_at=now()))
        reservation.payload = {**reservation.payload, "state": "released"}
        s.flush()
        self._refresh(s, run)

    def snapshot(self, s, pid, rid):
        rows, entries = records(s, pid, strict=False)
        used, _ = totals(rows, entries, rid=rid)
        billed, unknown, money, revisions = {}, [], Decimal(0), set()
        for row in rows:
            if row.run_id != rid or row.payload["intent"]["kind"] == "allocation":
                continue
            entry = entries.get((rid, row.request_id))
            if entry:
                for key, value in entry["tokens"].items():
                    billed[key] = billed.get(key, 0) + value
                money = None if money is None or entry["cost_usd"] is None else money + Decimal(entry["cost_usd"])
                if entry["pricing_revision"]:
                    revisions.add(entry["pricing_revision"])
            else:
                if row.payload["state"] == "unknown":
                    unknown.append(row.request_id)
                if row.payload["intent"]["resources"]["model_tokens"]:
                    money = None
        return UsageSnapshot(billed_token_categories=billed, reserved_tokens=max(0, used['model_tokens'] - sum(billed.values())),
            model_requests=used["model_requests"], tool_calls=used["tool_calls"],
            scientific_attempts=used["scientific_attempts"], active_seconds=used["active_seconds"],
            unknown_request_ids=sorted(unknown), cost={"status": "unknown", "reason": "Unpriced or unsettled model usage"}
            if money is None or not revisions else {"status": "estimated", "amount": float(money),
                "currency": "USD", "pricing_revision": next(iter(revisions)) if len(revisions) == 1 else "mixed"})

    def _refresh(self, s, run):
        if run.state in TERMINAL:
            return
        value = deepcopy(run.payload)
        value["usage"] = self.snapshot(s, run.project_id, run.id).model_dump(mode="json")
        self.runs.save(run, value)
        self.runs.event(s, run, "usage_changed")
        s.flush()
