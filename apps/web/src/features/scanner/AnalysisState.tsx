import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '../../components/Button';
import { ImagePreview } from '../../components/ImagePreview';

const SLOW_AFTER_MS = 20_000;

// The API returns one final response, so this shows no stages or percentages:
// anything more specific would claim progress the app cannot actually observe.
export function AnalysisState({ previewUrl, onCancel }: { previewUrl: string | null; onCancel: () => void }) {
  const reduceMotion = useReducedMotion();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      {previewUrl && (
        <ImagePreview src={previewUrl} alt="The photo being checked">
          {!reduceMotion && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-0.5 bg-ink shadow-[0_0_12px_2px_rgb(23_42_64/35%)]"
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
            />
          )}
        </ImagePreview>
      )}
      <div role="status" className="mt-5">
        <p className="font-medium">Reading the packaging and checking available registration records</p>
        <p className="mt-1 text-sm text-muted">
          {slow ? 'Still working. You can keep waiting or cancel.' : 'This can take a little while. Please keep this page open.'}
        </p>
      </div>
      <Button variant="secondary" onClick={onCancel} className="mt-5 w-full sm:w-auto">Cancel</Button>
    </div>
  );
}
