import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MAX_IMAGE_BYTES } from '@counterfeitiq/shared';
import './styles.css';

function App() {
  return (
    <main>
      <p className="eyebrow">CounterfeitIQ</p>
      <h1>Know what you're buying.</h1>
      <p className="lede">
        Scan a product to examine its details and check available registration records.
      </p>
      <section aria-labelledby="foundation-status">
        <h2 id="foundation-status">Foundation deployed</h2>
        <p>Product analysis is being built on shared, provenance-safe contracts.</p>
        <p className="limit">Image uploads will be limited to {MAX_IMAGE_BYTES / 1024 / 1024} MiB.</p>
      </section>
      <p className="notice">
        A registration match does not prove that a physical pack is genuine.
      </p>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(<StrictMode><App /></StrictMode>);
