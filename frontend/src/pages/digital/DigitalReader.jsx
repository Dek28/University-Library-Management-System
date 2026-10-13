import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, PageLoader, ErrorState, EmptyState,
} from '../../components/ui';
import { digitalApi } from '../../api/endpoints';
import {
  viewerKind, PdfViewer, DocxViewer, PptxViewer, EpubViewer,
} from './DocumentViewers';

const VIEWERS = {
  pdf: PdfViewer, docx: DocxViewer, pptx: PptxViewer, epub: EpubViewer,
};

/**
 * Reads a repository document inside the platform.
 *
 * The file is fetched with the user's session and handed to a viewer in
 * memory, so it is never reachable through a shareable link. PDF, Word (.docx),
 * PowerPoint (.pptx) and EPUB are readable; older .doc/.ppt files can only be
 * downloaded.
 */
export default function DigitalReader() {
  const { id } = useParams();
  const [blob, setBlob] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: ['digital', id],
    queryFn: () => digitalApi.get(id),
  });

  const kind = viewerKind(item);

  useEffect(() => {
    if (!kind) return undefined;
    const controller = new AbortController();

    setBlob(null);
    setFileError(null);
    digitalApi.read(id, { signal: controller.signal })
      .then(setBlob)
      .catch((err) => {
        if (!controller.signal.aborted) setFileError(err);
      });

    return () => controller.abort();
  }, [id, kind, attempt]);

  if (isLoading) return <PageLoader label="Opening document…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!item) return null;

  const download = async () => {
    try {
      await digitalApi.download(id, item.originalName);
      toast.success('Download started');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const Viewer = kind && VIEWERS[kind];

  return (
    <>
      <PageHeader
        title={item.title}
        description={(item.authorNames || []).join(', ') || undefined}
        breadcrumbs={[
          { label: 'Digital Library', to: '/digital-library' },
          { label: item.title, to: `/digital-library/${id}` },
          { label: 'Read' },
        ]}
        actions={(
          <>
            <Button as={Link} to={`/digital-library/${id}`} variant="secondary">Details</Button>
            {item.isDownloadable && <Button onClick={download}>Download</Button>}
          </>
        )}
      />

      <Card noPadding className="overflow-hidden">
        {!Viewer ? (
          <EmptyState
            icon={FileText}
            title="This format can't be read in the browser"
            description={item.isDownloadable
              ? `${item.originalName} is in an older format. Download it and open it in a suitable app.`
              : 'PDF, Word (.docx), PowerPoint (.pptx) and EPUB files can be read here; this one can only be downloaded, and downloads are switched off for it.'}
            action={item.isDownloadable ? <Button size="sm" onClick={download}>Download</Button> : undefined}
          />
        ) : fileError ? (
          <ErrorState message={fileError.message} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !blob ? (
          <div className="skeleton h-[calc(100vh-14rem)] min-h-[480px]" />
        ) : (
          <Viewer blob={blob} title={item.title} allowDownload={item.isDownloadable} />
        )}
      </Card>
    </>
  );
}
