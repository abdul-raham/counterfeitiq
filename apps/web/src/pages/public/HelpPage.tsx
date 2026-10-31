import { Link } from 'react-router';
import { PageHeading } from '../../components/PageHeading';

const answers = [
  { q: 'What does scanning tell me?', a: 'It shows what the manufacturer has on record for that code, such as the product, batch and pack details, and where that information came from.' },
  { q: 'Does finding a record mean the medicine is genuine?', a: 'No. A QR code can be copied, so a record does not prove what is inside the pack. Also check the seal and print, and buy from a licensed pharmacy.' },
  { q: 'Does "no record found" mean it is fake?', a: 'It depends on what you scanned. A CounterfeitIQ QR code only goes on the packs of manufacturers connected to us, so one missing from their records is fake, and the app says so. If you typed a code or scanned an ordinary barcode, no: it may be mistyped, or its manufacturer may not be connected.' },
  { q: 'What is a demo record?', a: 'This demonstration uses a simulated manufacturer system with fictional companies and products. The source line on a result says so, and these records are not real product data.' },
  { q: 'Why does it say a pack was scanned before?', a: 'Some packs have their own serial number, so we can tell when the same code is scanned again. That could be you, a shop, a pharmacist or another shopper, so it does not mean the product is fake. We ask whether the pack is sealed, because that changes what to do next. Codes that only identify the product are shared by every pack, so they never show this.' },
  { q: 'What do you record when I scan?', a: 'For a serialized pack, a scrambled form of its code, how many times it was scanned, when, and a scrambled random value for this browser. It is erased 30 days after the last scan. We do not store your name, location or IP address.' },
  { q: 'What is packaging inspection?', a: 'An optional check where an AI reads a photo of the pack and compares it with registration records. It is separate from scanning, and the AI can misread a photo.' },
  { q: 'Is CounterfeitIQ part of NAFDAC?', a: 'No. CounterfeitIQ is independent, and is not affiliated with or endorsed by NAFDAC.' },
];

export function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Help" />
      <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
        {answers.map(({ q, a }) => (
          <div key={q} className="p-4 sm:p-5">
            <dt className="font-medium">{q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted">{a}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-muted">
        Worried about a pack? <Link to="/report" className="rounded-sm text-ink underline underline-offset-4">See how to report a concern</Link>.
      </p>
    </div>
  );
}
