import { Navigate, useNavigate } from 'react-router';
import { Camera, Hash } from 'lucide-react';
import { Button, ButtonLink } from '../components/Button';
import { PageHeading } from '../components/PageHeading';
import { Report } from '../features/report/Report';
import { describeOutcome } from '../features/report/outcome';
import { useScan } from '../features/scanner/ScanContext';

export function InspectReportPage() {
  const navigate = useNavigate();
  const { result, previewUrl, reset } = useScan();

  // Reports are never stored, so a refresh or direct visit has nothing to show.
  if (!result) return <Navigate to="/inspect" replace />;

  const { suggestRetake } = describeOutcome(result);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeading title="Packaging report" />
      <Report response={result} imageUrl={previewUrl} />
      <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
        <Button
          onClick={() => {
            reset();
            navigate('/inspect');
          }}
        >
          <Camera aria-hidden="true" className="size-5" />
          {suggestRetake ? 'Try a clearer photo' : 'Scan another product'}
        </Button>
        <ButtonLink to="/lookup" variant="secondary">
          <Hash aria-hidden="true" className="size-5" />
          Enter NAFDAC number
        </ButtonLink>
      </div>
    </div>
  );
}
