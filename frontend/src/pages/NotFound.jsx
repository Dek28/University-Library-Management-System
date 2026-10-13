import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Button, Card } from '../components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center py-8 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-3xl font-bold leading-none text-slate-900">404</p>
          <p className="mt-2 text-md font-semibold text-slate-800">This page does not exist</p>
          <p className="mt-1 text-sm text-slate-500">
            The link may be out of date, or the record may have been removed.
          </p>
          <div className="mt-5 flex gap-2">
            <Button as={Link} to="/dashboard">Go to dashboard</Button>
            <Button as={Link} to="/catalog" variant="secondary">Search the catalogue</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
