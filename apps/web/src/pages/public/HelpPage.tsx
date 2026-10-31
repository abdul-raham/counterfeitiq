import { Link } from 'react-router';
import { PageHeading } from '../../components/PageHeading';

const answers = [
  { q: 'Which check should I do first?', a: 'Scan the QR code first. It shows the product details and does not use up anything. Only then scratch the hidden panel and enter the code.' },
  { q: 'Does a recognized code mean the medicine is genuine?', a: "No. It means the code is in the manufacturer's records. A code can be copied, so also check the seal and print, and buy from a licensed pharmacy." },
  { q: 'Why does it say my code was checked before?', a: 'Each code should be checked once. A repeat can mean someone else checked it, that it was copied, or that you checked it earlier. It does not prove the product is fake.' },
  { q: 'What is the difference between the three checks?', a: "Code check: the scratch code against the manufacturer's records. Registration lookup: a NAFDAC number against NAFDAC's public Greenbook. Packaging inspection: AI reads the pack and compares what it finds. Each one is separate evidence." },
  { q: 'Is CounterfeitIQ part of NAFDAC?', a: 'No. CounterfeitIQ is independent and is not affiliated with or endorsed by NAFDAC.' },
  { q: 'I feel unwell after taking a medicine. What should I do?', a: 'Speak to a pharmacist or doctor now. This app cannot give medical advice.' },
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
        Worried about a pack? <Link to="/report" className="rounded-sm text-ink underline underline-offset-4">Report a concern</Link>.
      </p>
    </div>
  );
}
