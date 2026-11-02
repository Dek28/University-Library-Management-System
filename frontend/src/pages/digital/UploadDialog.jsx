import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { UploadCloud, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea, Checkbox } from '../../components/ui';
import { digitalApi, referenceApi } from '../../api/endpoints';
import { digitalSchema } from '../../validators/schemas';
import { RESOURCE_TYPES, ACCESS_LEVELS } from '../../constants';
import { formatBytes } from '../../utils/format';

const ACCEPTED = '.pdf,.doc,.docx,.ppt,.pptx,.epub';

export default function UploadDialog({ open, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const { data: options } = useQuery({
    queryKey: ['digital', 'form-options'],
    queryFn: async () => {
      const [faculties, departments] = await Promise.all([
        referenceApi.list('faculties', { limit: 100 }),
        referenceApi.list('departments', { limit: 200 }),
      ]);
      return { faculties: faculties.items, departments: departments.items };
    },
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(digitalSchema),
    defaultValues: { accessLevel: 'university', resourceType: 'thesis', isDownloadable: true, isPublished: true },
  });

  const close = () => {
    reset();
    setFile(null);
    setProgress(0);
    onClose();
  };

  const onSubmit = async (values) => {
    if (!file) {
      toast.error('Choose a document to upload');
      return;
    }
    try {
      await digitalApi.upload(file, values, setProgress);
      toast.success('Repository item uploaded');
      close();
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setProgress(0);
    }
  };

  const pick = (selected) => {
    if (!selected) return;
    // The file picker filters by type, but a dropped file bypasses it.
    const extension = (selected.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (!ACCEPTED.split(',').includes(extension)) {
      toast.error(`"${selected.name}" is not a supported document type.`);
      return;
    }
    const maxBytes = 25 * 1024 * 1024;
    if (selected.size > maxBytes) {
      toast.error(`"${selected.name}" is ${formatBytes(selected.size)}. The limit is 25MB.`);
      return;
    }
    setFile(selected);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload to the repository"
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button form="upload-form" type="submit" loading={isSubmitting}>Upload</Button>
        </>
      )}
    >
      <form id="upload-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50'
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-brand-600" aria-hidden="true" />
              <div className="text-left">
                <p className="text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label="Remove file">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm text-slate-600">
                Drag a document here, or{' '}
                <label className="cursor-pointer font-medium text-brand-600 hover:underline">
                  browse
                  <input type="file" accept={ACCEPTED} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                </label>
              </p>
              <p className="mt-1 text-xs text-slate-500">PDF, DOC, DOCX, PPT, PPTX or EPUB, up to 25MB</p>
            </>
          )}

          {progress > 0 && progress < 100 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required wrapperClassName="sm:col-span-2" error={errors.title?.message} {...register('title')} />
          <Select label="Resource type" required options={RESOURCE_TYPES} error={errors.resourceType?.message} {...register('resourceType')} />
          <Input label="Year" type="number" error={errors.year?.message} {...register('year')} />
          <Input label="Authors" placeholder="Comma-separated" hint="e.g. A. Mwangi, B. Said" error={errors.authorNames?.message} {...register('authorNames')} />
          <Input label="Supervisor" error={errors.supervisor?.message} {...register('supervisor')} />
          <Select
            label="Faculty"
            placeholder="Not faculty-specific"
            options={(options?.faculties || []).map((f) => ({ value: f.id, label: f.name }))}
            {...register('faculty')}
          />
          <Select
            label="Department"
            placeholder="Not department-specific"
            options={(options?.departments || []).map((d) => ({ value: d.id, label: d.name }))}
            {...register('department')}
          />
        </div>

        <Textarea label="Abstract" rows={4} error={errors.abstract?.message} {...register('abstract')} />
        <Input label="Keywords" placeholder="Comma-separated" {...register('keywords')} />

        <Select
          label="Access level"
          required
          options={ACCESS_LEVELS}
          error={errors.accessLevel?.message}
          {...register('accessLevel')}
        />

        <div className="space-y-3 border-t border-line pt-4">
          <Checkbox label="Allow download" {...register('isDownloadable')} />
          <Checkbox label="Publish immediately" {...register('isPublished')} />
        </div>
      </form>
    </Modal>
  );
}
