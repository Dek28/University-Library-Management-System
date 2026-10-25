import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, DetailRow, Badge, PageLoader, ErrorState,
} from '../../components/ui';
import { digitalApi } from '../../api/endpoints';
import { formatBytes, formatDate, fullName, humanize } from '../../utils/format';

export default function DigitalDetails() {
  const { id } = useParams();

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: ['digital', id],
    queryFn: () => digitalApi.get(id),
  });

  if (isLoading) return <PageLoader label="Loading repository item…" />;
  if (error) {
    // The API answers 404 both for a missing item and for one the caller may
    // not read, so the message must not imply the item exists.
    return <ErrorState message={error.message} onRetry={refetch} />;
  }
  if (!item) return null;

  const download = async () => {
    try {
      await digitalApi.download(id, item.originalName);
      toast.success('Download started');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Repository item"
        breadcrumbs={[
          { label: 'Digital Library', to: '/digital-library' },
          { label: 'Repository', to: '/digital-library' },
          { label: item.title },
        ]}
        actions={(
          <>
            <Button as={Link} to="/digital-library" variant="secondary">Back</Button>
            {item.isDownloadable && <Button variant="secondary" onClick={download}>Download</Button>}
            <Button as={Link} to={`/digital-library/${id}/read`}>Read</Button>
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex gap-5">
            <div className="flex h-28 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100 ring-1 ring-line">
              <FileText className="h-10 w-10 text-slate-300" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-snug text-slate-900">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {(item.authorNames || []).join(', ') || 'Author not recorded'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge tone="blue">{humanize(item.resourceType)}</Badge>
                <Badge tone={item.accessLevel === 'public' ? 'green' : item.accessLevel === 'restricted' ? 'red' : 'slate'}>
                  {humanize(item.accessLevel)}
                </Badge>
                {!item.isPublished && <Badge tone="amber">Unpublished</Badge>}
                {!item.isDownloadable && <Badge tone="purple">No download</Badge>}
              </div>
            </div>
          </div>

          {item.abstract && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">Abstract</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{item.abstract}</p>
            </div>
          )}

          {(item.keywords || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {item.keywords.map((keyword) => <Badge key={keyword} tone="slate">{keyword}</Badge>)}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Metadata">
            <dl className="divide-y divide-line">
              <DetailRow label="Year">{item.year || '-'}</DetailRow>
              <DetailRow label="Supervisor">{item.supervisor || '-'}</DetailRow>
              <DetailRow label="Faculty">{item.faculty?.name || '-'}</DetailRow>
              <DetailRow label="Department">{item.department?.name || '-'}</DetailRow>
              <DetailRow label="Uploaded by">{fullName(item.uploadedBy) || '-'}</DetailRow>
              <DetailRow label="Uploaded on">{formatDate(item.createdAt)}</DetailRow>
            </dl>
          </Card>

          <Card title="File">
            <dl className="divide-y divide-line">
              <DetailRow label="Original name">{item.originalName}</DetailRow>
              <DetailRow label="Format">{item.mimeType}</DetailRow>
              <DetailRow label="Size">{formatBytes(item.fileSize)}</DetailRow>
              <DetailRow label="Downloads">{item.downloadCount || 0}</DetailRow>
              <DetailRow label="Views">{item.viewCount || 0}</DetailRow>
            </dl>
            <p className="mt-3 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Files are streamed through an authorised endpoint. The storage location is never exposed,
              so the access level cannot be bypassed with a direct link.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
