import qrcode from 'qrcode-generator';
import { SAMPLE_PACKS } from '../sample/v2Sample';

function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}

/** Sample mode only. Real labels need the controlled secret-export operation. */
export function DemoLabels({ allocationId }: { allocationId: string }) {
  const packs = SAMPLE_PACKS.slice(0, 2);
  return (
    <section aria-label={`Demonstration labels for ${allocationId}`} className="grid gap-3 sm:grid-cols-2">
      {packs.map((pack) => (
        <article key={pack.id} className="rounded-lg border-2 border-dashed border-warn-line bg-surface p-4">
          <p className="text-xs font-semibold text-warn">DEMONSTRATION LABEL. NOT A REAL CODE.</p>
          {/* The SVG comes from the QR library using our own fixed identifier. */}
          <div aria-hidden="true" className="mt-2 size-32" dangerouslySetInnerHTML={{ __html: qrSvg(`${window.location.origin}/product/${pack.id}`) }} />
          <p className="mt-2 text-sm">Pack ID: <span className="font-medium">{pack.id}</span></p>
          <p className="mt-1 text-sm">Scratch panel: <span className="font-medium">{pack.code}</span></p>
        </article>
      ))}
    </section>
  );
}
