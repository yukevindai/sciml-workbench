'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, Database, FlaskConical, Plus, ShieldCheck } from 'lucide-react';
import { api, json } from '../lib/api';
import { parseProject } from '../lib/decode';
import type { Workbench } from '../lib/context';
import { Field, Panel, Tile } from '../components/ui';
import { NextAction, PipelineRail } from '../components/workflow';

export function ProjectsView({ wb }: { wb: Workbench }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const { counts } = wb.workflow;
  const hasWork = wb.artifacts.length > 0;

  return (
    <>
      <NextAction stage={wb.workflow.next} hasProject={Boolean(wb.projectId)} />

      {hasWork && (
        <div className="tiles">
          <Tile icon={Database} label="Datasets" value={counts.dataset} note="CSV files under audit" />
          <Tile icon={ShieldCheck} label="Audits" value={counts.audit} note="Quality checks run" />
          <Tile icon={Activity} label="Benchmark runs" value={counts.benchmark} note="Baselines evaluated" />
          <Tile icon={FlaskConical} label="Lessons saved" value={counts.failure} note="Recorded in failure memory" />
        </div>
      )}

      <div className="split split--wide-first">
        <Panel
          title="Your workflow"
          description="Four steps, in order. Each one keeps a link to the artifacts it was built from, which is what makes the final report reproducible."
        >
          <PipelineRail stages={wb.workflow.stages} />
        </Panel>

        <Panel
          title="Create a project"
          description="Start with a name. You can add a research question, datasets, and source PDFs as you go."
        >
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!name.trim()) { setNameError('Enter a project name; spaces alone are not a name.'); return; }
              setNameError('');
              void wb.act(async () => {
                const project = await api('projects', parseProject, json({ name: name.trim(), description }));
                wb.setProjects(current => [project, ...current]);
                wb.setProjectId(project.id);
                setName('');
                setDescription('');
                wb.setNotice('Project created. Attach a CSV or source PDF to begin.');
              });
            }}
          >
            <fieldset className="intake-fields" disabled={wb.busy}>
            <Field label="Project name" hint="Something you will recognise in six months." error={nameError || undefined}>
              {props => (
                <input
                  className="input"
                  required
                  maxLength={160}
                  placeholder="Electrolyte screening study"
                  value={name}
                  onChange={event => { setName(event.target.value); setNameError(''); }}
                  {...props}
                />
              )}
            </Field>

            <Field
              label="Research question"
              hint="Optional. What should a model trained on this data be able to predict, and for what?"
            >
              {props => (
                <textarea
                  className="textarea"
                  maxLength={2000}
                  placeholder="Can conductivity be predicted for electrolyte families the model has never seen?"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <div className="panel-foot">
              <span className="field-hint">
                {wb.projects.length
                  ? `${wb.projects.length} project${wb.projects.length === 1 ? '' : 's'} in this workspace`
                  : 'This will be your first project'}
              </span>
              <button className="button" disabled={wb.busy} type="submit">
                <Plus size={15} aria-hidden="true" />Create project
              </button>
            </div>
            </fieldset>
          </form>
        </Panel>
      </div>

      {wb.activeProject && (
        <Panel title="Active project" headingLevel={2}>
          <div className="stack stack--tight">
            <h3>{wb.activeProject.name}</h3>
            <p className="prose">
              {wb.activeProject.description || 'No research question recorded for this project yet.'}
            </p>
            <div className="research-actions">
              <Link className="button" href="/dataset-audit">Attach a CSV</Link>
              <Link className="button button--secondary" href="/evidence">Attach a source PDF</Link>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
