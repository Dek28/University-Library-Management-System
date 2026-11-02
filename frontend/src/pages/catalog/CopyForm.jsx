import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea } from '../../components/ui';
import { copyApi, referenceApi } from '../../api/endpoints';
import { copySchema, batchCopySchema } from '../../validators/schemas';
import { COPY_CONDITIONS } from '../../constants';
import { cleanParams, shelfLabel } from '../../utils/format';
import useFinesEnabled from '../../hooks/useFinesEnabled';

/**
 * Adds or edits physical copies.
 *
 * Creating supports a quantity so a librarian can accession a whole delivery in
 * one action; accession numbers and barcodes are generated server-side.
 */
export default function CopyForm({ open, onClose, resource, copy, onSaved }) {
  const isEdit = Boolean(copy);
  const finesEnabled = useFinesEnabled();

  const { data: shelves } = useQuery({
    queryKey: ['reference', 'shelves', 'options'],
    queryFn: () => referenceApi.list('shelves', { limit: 200, isActive: true }),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const {
    register, handleSubmit, reset, formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? copySchema.omit({ resource: true }) : batchCopySchema),
  });

  useEffect(() => {
    if (!open) return;
    reset(isEdit
      ? {
        accessionNumber: copy.accessionNumber,
        barcode: copy.barcode,
        shelf: copy.shelf?.id || copy.shelf || '',
        section: copy.section || '',
        rack: copy.rack || '',
        condition: copy.condition || 'good',
        price: copy.price ?? '',
        replacementCost: copy.replacementCost ?? '',
        notes: copy.notes || '',
      }
      : {
        resource: resource.id,
        quantity: 1,
        shelf: '',
        section: '',
        rack: '',
        condition: 'good',
        price: resource.purchasePrice ?? '',
        replacementCost: resource.replacementCost ?? '',
        notes: '',
      });
  }, [open, isEdit, copy, resource, reset]);

  const onSubmit = async (values) => {
    try {
      const payload = cleanParams(values);
      if (isEdit) {
        await copyApi.update(copy.id, payload);
        toast.success('Copy updated');
      } else {
        const created = await copyApi.createBatch({ ...payload, resource: resource.id });
        toast.success(`${created.length} copy/copies added`);
      }
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const shelfOptions = (shelves?.items || []).map((shelf) => ({
    value: shelf.id,
    label: shelfLabel(shelf),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit copy' : 'Add copies'}
      description={resource?.title}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button form="copy-form" type="submit" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Add copies'}
          </Button>
        </>
      )}
    >
      <form id="copy-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {!isEdit && (
          <Input
            label="Number of copies"
            type="number"
            min={1}
            max={100}
            required
            error={errors.quantity?.message}
            {...register('quantity')}
          />
        )}

        {isEdit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Accession number" error={errors.accessionNumber?.message} {...register('accessionNumber')} />
            <Input label="Barcode" error={errors.barcode?.message} {...register('barcode')} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Shelf" placeholder="Not shelved yet" options={shelfOptions} error={errors.shelf?.message} {...register('shelf')} />
          <Select label="Condition" options={COPY_CONDITIONS} error={errors.condition?.message} {...register('condition')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Section" placeholder="e.g. Computing" error={errors.section?.message} {...register('section')} />
          <Input label="Rack" placeholder="e.g. R1" error={errors.rack?.message} {...register('rack')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Price" type="number" step="0.01" min="0" error={errors.price?.message} {...register('price')} />
          <Input
            label="Replacement cost"
            type="number"
            step="0.01"
            min="0"
            hint={finesEnabled ? 'Used to charge for a lost copy.' : undefined}
            error={errors.replacementCost?.message}
            {...register('replacementCost')}
          />
        </div>

        <Textarea label="Notes" rows={2} error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  );
}
