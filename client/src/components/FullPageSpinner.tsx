import Spinner from './Spinner';

export default function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-6 w-6 border-muted" />
    </div>
  );
}
