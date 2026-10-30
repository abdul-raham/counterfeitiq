import { ButtonLink } from '../components/Button';
import { PageHeading } from '../components/PageHeading';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <PageHeading title="Page not found">That page doesn't exist.</PageHeading>
      <ButtonLink to="/" variant="secondary" className="mt-6">Back to home</ButtonLink>
    </div>
  );
}
