"""Commit conservative model reservations before provider IO, settle afterward.

There is no inferred tokenizer bound or default pricing. Deployment supplies a
reviewed bound covering the configured model's whole accepted input/context and
all billed input/cache categories, including protocol/tool overhead. Without
that bound dispatch is disabled. The provider is never called inside a DB lock.
"""
import hashlib
import json
import math
import time

from pydantic import Field

from .budgets import BudgetService, Resources, Pricing
from .contract_core import ContractModel, Identifier
from .model_provider import ProviderError


class ModelBound(ContractModel):
    model: Identifier
    revision: Identifier
    source_reference: Identifier
    max_request_bytes: int = Field(strict=True, gt=0, le=1000000)
    input_tokens: int = Field(strict=True, gt=0)
    max_output_tokens: int = Field(strict=True, gt=0)
    max_active_seconds: int = Field(strict=True, gt=0)


class BudgetedProvider:
    def __init__(self, db, provider, *, bounds: dict[str, ModelBound], prices: dict[str, Pricing] | None = None):
        self.db, self.provider = db, provider
        self.bounds = {key: value.model_copy(deep=True) for key, value in bounds.items()}
        self.prices = {key: value.model_copy(deep=True) for key, value in (prices or {}).items()}
        self.budgets = BudgetService()

    def complete(self, *, project_id, run_id, request_id, expected_revision, claim_token,
                 model, context, tools, max_tokens, assignment_id=None, finalization=False, retry=False):
        bound = self.bounds.get(model)
        if bound is None or bound.model != model or self.provider.resolved_model(model) != model:
            raise ProviderError("token_bound_unavailable")
        # This identity binds every context byte and schema without storing prompts.
        request = {"model": model, "context": [vars(p) for p in context],
                   "tools": [{"name": t.name, "description": t.description,
                              "schema": t.input_model.model_json_schema()} for t in tools],
                   "max_tokens": max_tokens, "bound": bound.model_dump(mode="json")}
        raw = json.dumps(request, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
        if type(max_tokens) is not int or not 0 < max_tokens <= bound.max_output_tokens or len(raw) > bound.max_request_bytes:
            raise ProviderError("token_bound_exceeded")
        resources = Resources(model_tokens=bound.input_tokens + max_tokens, model_requests=1,
                              active_seconds=bound.max_active_seconds, transient_retries=int(retry))
        with self.db.session.begin() as s:
            run = self.budgets.runs.get(s, project_id, run_id, lock=True)
            policy = self.budgets.runs.effective_policy(s, run)
            if assignment_id is not None:
                from .agent_db import AssignmentRow
                from .research_contracts import SpecialistAssignment
                assignment = s.get(AssignmentRow, assignment_id)
                if assignment is None or assignment.run_id != run_id or assignment.project_id != project_id:
                    raise ProviderError("assignment_not_authorized")
                scope = SpecialistAssignment.model_validate(assignment.payload)
                policy = policy.model_copy(update={
                    "allowed_tools": policy.allowed_tools & frozenset(scope.allowed_tools),
                    "artifact_ids": policy.artifact_ids & frozenset(scope.allowed_artifact_ids),
                    "material_ids": policy.material_ids & frozenset(scope.allowed_material_ids)})
            self.budgets.reserve(s, project_id, run_id, request_id, resources,
                request_sha256=hashlib.sha256(raw).hexdigest(), expected_revision=expected_revision,
                claim_token=claim_token, assignment_id=assignment_id, finalization=finalization,
                model=model, pricing=self.prices.get(model))
            if not self.budgets.dispatch(s, project_id, run_id, request_id):
                raise ProviderError("request_already_dispatched", usage_unknown=True)
        started = time.monotonic()
        try:
            result = self.provider.complete(model=model, policy=policy, context=context, tools=tools, max_tokens=max_tokens)
        except ProviderError as exc:
            if not exc.usage_unknown:
                with self.db.session.begin() as s:
                    self.budgets.settle(s, project_id, run_id, request_id, Resources(model_requests=1,
                        active_seconds=math.ceil(time.monotonic() - started), transient_retries=int(retry)))
            raise
        # Arbitrary failures and process death deliberately leave unknown usage.
        with self.db.session.begin() as s:
            entry = self.budgets.settle(s, project_id, run_id, request_id,
                Resources(model_tokens=sum(result.usage.values()), model_requests=1,
                          active_seconds=math.ceil(time.monotonic() - started), transient_retries=int(retry)), tokens=result.usage)
            exceeded = entry.payload["overrun"]
        if exceeded:
            raise ProviderError("usage_exceeded_trusted_bound")
        return result
