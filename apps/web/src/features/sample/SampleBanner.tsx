import { useId, useState } from 'react';
import { useLocation } from 'react-router';
import {
  getSampleScenario,
  sampleScenarioOptions,
  setSampleScenario,
  type SampleScenario,
} from './sample';

export default function SampleBanner() {
  const id = useId();
  const [scenario, setScenario] = useState(getSampleScenario);
  const inspecting = useLocation().pathname.startsWith('/inspect');

  return (
    <aside aria-label="Sample mode" className="bg-warn-soft border-b border-warn-line text-warn">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <p className="font-medium">Sample mode. Nothing here comes from NAFDAC or a real analysis.</p>
        {inspecting && <div className="flex items-center gap-2">
          <label htmlFor={id}>Next inspection</label>
          <select
            id={id}
            value={scenario}
            className="rounded-md border border-warn-line bg-surface px-2 py-1 text-ink"
            onChange={(event) => {
              const next = event.target.value as SampleScenario;
              setScenario(next);
              setSampleScenario(next);
            }}
          >
            {sampleScenarioOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>}
      </div>
    </aside>
  );
}
