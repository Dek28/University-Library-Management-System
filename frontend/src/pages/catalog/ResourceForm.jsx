import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Checkbox,
  PageLoader,
  ErrorState,
} from '../../components/ui';

import {
  resourceApi,
  referenceApi,
} from '../../api/endpoints';

import { resourceSchema } from '../../validators/schemas';
import { RESOURCE_TYPES } from '../../constants';
import { cleanParams, shelfLabel } from '../../utils/format';
import useFinesEnabled from '../../hooks/useFinesEnabled';

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
const ordinal = (n) => {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

/** Editions are stored as "1st", "2nd", ... and shown as "1st Edition". */
const EDITION_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  value: ordinal(i + 1),
  label: `${ordinal(i + 1)} Edition`,
}));

const CURRENT_YEAR = new Date().getFullYear();
const EARLIEST_YEAR = 1800;

/** Newest first, so recent years are at the top of the list. */
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - EARLIEST_YEAR + 1 },
  (_, i) => String(CURRENT_YEAR - i)
);

/** Keeps a saved value selectable even when it is not in the standard list. */
const withExisting = (options, value) => {
  if (!value) return options;
  const exists = options.some((o) => String(o.value ?? o) === String(value));
  return exists ? options : [{ value: String(value), label: String(value) }, ...options];
};


/**
 * Multi-select rendered as a checkbox list,
 * used for subjects.
 */
function MultiSelect({
  label,
  options,
  value = [],
  onChange,
  hint,
  emptyLabel,
}) {
  const toggle = (id) => {
    onChange(
      value.includes(id)
        ? value.filter((v) => v !== id)
        : [...value, id]
    );
  };

  return (
    <div>
      <p className="form-label">{label}</p>

      <div className="max-h-44 overflow-y-auto rounded-md border border-line-strong bg-panel p-2">
        {options.length === 0 && (
          <p className="px-1 py-2 text-xs text-slate-500">
            {emptyLabel}
          </p>
        )}

        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />

            <span className="text-sm text-slate-700">
              {option.label}
            </span>
          </label>
        ))}
      </div>

      {hint && (
        <p className="form-hint">{hint}</p>
      )}
    </div>
  );
}


/**
 * Free-form tag entry, used for authors and keywords.
 * Duplicates are ignored regardless of case.
 */
function TagInput({
  label,
  placeholder,
  hint,
  value = [],
  onChange,
  normalise = (text) => text,
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const tag = normalise(draft.replace(/\s+/g, ' ').trim());
    const exists = value.some((v) => v.toLowerCase() === tag.toLowerCase());

    if (tag && !exists) {
      onChange([...value, tag]);
    }

    setDraft('');
  };

  return (
    <div>
      <p className="form-label">{label}</p>

      <div className="flex gap-2">
        <input
          className="form-control"
          value={draft}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
        />

        <Button
          type="button"
          variant="secondary"
          onClick={add}
        >
          Add
        </Button>
      </div>

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
            >
              {tag}

              <button
                type="button"
                onClick={() =>
                  onChange(
                    value.filter((t) => t !== tag)
                  )
                }
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3 text-slate-400 hover:text-slate-700" />
              </button>
            </span>
          ))}
        </div>
      )}

      {hint && (
        <p className="form-hint">{hint}</p>
      )}
    </div>
  );
}


export default function ResourceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const finesEnabled = useFinesEnabled();

  const [authorNames, setAuthorNames] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [keywords, setKeywords] = useState([]);

  /**
   * Load existing resource when editing.
   */
  const {
    data: existing,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => resourceApi.get(id),
    enabled: isEdit,
  });

  /**
   * Load reference data used by dropdowns.
   */
  const options = useQuery({
    queryKey: ['catalog', 'form-options'],

    queryFn: async () => {
      const [
        categoryList,
        publisherList,
        languageList,
        departmentList,
        facultyList,
        subjectList,
        shelfList,
      ] = await Promise.all([
        referenceApi.list('categories', {
          limit: 200,
        }),

        referenceApi.list('publishers', {
          limit: 200,
        }),

        referenceApi.list('languages', {
          limit: 100,
        }),

        referenceApi.list('departments', {
          limit: 200,
        }),

        referenceApi.list('faculties', {
          limit: 100,
        }),

        referenceApi.list('subjects', {
          limit: 200,
        }),

        referenceApi.list('shelves', {
          limit: 200,
          isActive: true,
        }),
      ]);

      return {
        categories: categoryList.items,
        publishers: publisherList.items,
        languages: languageList.items,
        departments: departmentList.items,
        faculties: facultyList.items,
        subjects: subjectList.items,
        shelves: shelfList.items,
      };
    },

    staleTime: 5 * 60_000,
  });

  /**
   * React Hook Form setup.
   */
  const {
    register,
    handleSubmit,
    reset,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm({
    resolver: zodResolver(resourceSchema),

    defaultValues: {
      resourceType: 'book',
      shelf: '',
      isBorrowable: true,
      isReferenceOnly: false,
    },
  });

  /**
   * Populate form values when editing.
   */
  useEffect(() => {
    if (!existing) return;

    reset({
      title: existing.title,
      subtitle: existing.subtitle || '',
      resourceType: existing.resourceType,

      isbn: existing.isbn || '',

      shelf: existing.shelf?.id || existing.shelf || '',

      publisher: existing.publisher?.id || '',
      publicationYear: existing.publicationYear ? String(existing.publicationYear) : '',

      edition: existing.edition || '',
      volume: existing.volume || '',

      language: existing.language?.id || '',

      pages: existing.pages || '',

      category: existing.category?.id || '',

      department: existing.department?.id || '',
      faculty: existing.faculty?.id || '',

      description: existing.description || '',

      acquisitionSource:
        existing.acquisitionSource || 'purchase',

      supplier: existing.supplier || '',

      purchasePrice:
        existing.purchasePrice ?? '',

      replacementCost:
        existing.replacementCost ?? '',

      isBorrowable: existing.isBorrowable,

      isReferenceOnly:
        existing.isReferenceOnly,
    });

    setAuthorNames(
      (existing.authors || []).map((a) => a.fullName || `${a.firstName} ${a.lastName}`)
    );

    setSubjects(
      (existing.subjects || []).map((s) => s.id)
    );

    setKeywords(
      existing.keywords || []
    );
  }, [existing, reset]);

  if (isEdit && isLoading) {
    return (
      <PageLoader label="Loading record…" />
    );
  }

  if (isEdit && error) {
    return (
      <ErrorState message={error.message} />
    );
  }

  /**
   * Submit create/update request.
   */
  const onSubmit = async (values) => {
    const payload = {
      ...cleanParams(values),
      authorNames,
      subjects,
      keywords,
    };

    /**
     * Booleans are meaningful even when false,
     * so restore them after cleaning.
     */
    payload.isBorrowable =
      Boolean(values.isBorrowable);

    payload.isReferenceOnly =
      Boolean(values.isReferenceOnly);

    try {
      const saved = isEdit
        ? await resourceApi.update(
            id,
            payload
          )
        : await resourceApi.create(
            payload
          );

      toast.success(
        isEdit
          ? 'Catalogue record updated'
          : 'Catalogue record created'
      );

      navigate(
        `/catalog/${saved.id}`
      );
    } catch (err) {
      toast.error(err.message);

      (err.errors || []).forEach(
        (fieldError) =>
          toast.error(
            `${fieldError.field}: ${fieldError.message}`
          )
      );
    }
  };

  /**
   * Convert reference records into Select options.
   */
  const asOptions = (
    items = [],
    labelKey = 'name'
  ) =>
    items.map((item) => ({
      value: item.id,
      label: item[labelKey],
    }));

  /**
   * Shelf dropdown options, e.g. "Shelf A1 (Computing)".
   */
  const shelfOptions = (options.data?.shelves || []).map(
    (shelf) => ({
      value: shelf.id,
      label: shelfLabel(shelf),
    })
  );

  return (
    <>
      <PageHeader
        title={
          isEdit
            ? 'Edit Book'
            : 'Add Book'
        }
        breadcrumbs={[
          {
            label: 'Catalog',
            to: '/catalog',
          },
          {
            label: 'Books',
            to: '/catalog',
          },
          {
            label: isEdit
              ? 'Edit'
              : 'Add',
          },
        ]}
        actions={
          <Button
            as={Link}
            to={
              isEdit
                ? `/catalog/${id}`
                : '/catalog'
            }
            variant="secondary"
          >
            Cancel
          </Button>
        }
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full space-y-4 lg:w-2/3"
        noValidate
      >

        {/* Bibliographic details */}

        <Card title="Bibliographic details">
          <div className="grid gap-4 sm:grid-cols-2">

            <Input
              label="Title"
              required
              wrapperClassName="sm:col-span-2"
              error={errors.title?.message}
              {...register('title')}
            />

            <Input
              label="Subtitle"
              wrapperClassName="sm:col-span-2"
              error={errors.subtitle?.message}
              {...register('subtitle')}
            />

            <Select
              label="Resource type"
              required
              options={RESOURCE_TYPES}
              error={errors.resourceType?.message}
              {...register('resourceType')}
            />

            <Select
              label="Category"
              placeholder="Uncategorised"
              options={asOptions(
                options.data?.categories
              )}
              error={errors.category?.message}
              {...register('category')}
            />

            <Input
              label="ISBN"
              placeholder="978…"
              error={errors.isbn?.message}
              {...register('isbn')}
            />

            <Select
              label="Publisher"
              placeholder="Unknown"
              options={asOptions(
                options.data?.publishers
              )}
              error={errors.publisher?.message}
              {...register('publisher')}
            />

            <Select
              label="Publication year"
              placeholder="Select year"
              options={withExisting(
                YEAR_OPTIONS,
                existing?.publicationYear
              )}
              error={
                errors.publicationYear?.message
              }
              {...register(
                'publicationYear'
              )}
            />

            <Select
              label="Edition"
              placeholder="Select edition"
              options={withExisting(
                EDITION_OPTIONS,
                existing?.edition
              )}
              error={errors.edition?.message}
              {...register('edition')}
            />

            <Select
              label="Language"
              placeholder="Unspecified"
              options={asOptions(
                options.data?.languages
              )}
              error={errors.language?.message}
              {...register('language')}
            />

            <Input
              label="Volume"
              error={errors.volume?.message}
              {...register('volume')}
            />

            <Input
              label="Number of pages"
              type="number"
              error={errors.pages?.message}
              {...register('pages')}
            />

            {/* SHELF (LOCATION OF THE BOOK) */}

            <Select
              label="Shelf (location)"
              placeholder="No shelf assigned"
              options={shelfOptions}
              error={errors.shelf?.message}
              {...register('shelf')}
            />

          </div>
        </Card>


        {/* Classification */}

        <Card title="Classification and discovery">

          <div className="grid gap-4 xl:grid-cols-2">

            <TagInput
              label="Authors"
              placeholder="Type an author's full name and press Enter"
              value={authorNames}
              onChange={setAuthorNames}
            />

            <MultiSelect
              label="Subjects"
              options={asOptions(
                options.data?.subjects
              )}
              value={subjects}
              onChange={setSubjects}
              emptyLabel="No subjects configured yet."
            />

          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">

            <Select
              label="Faculty"
              placeholder="Not faculty-specific"
              options={asOptions(
                options.data?.faculties
              )}
              {...register('faculty')}
            />

            <Select
              label="Department"
              placeholder="Not department-specific"
              options={asOptions(
                options.data?.departments
              )}
              {...register('department')}
            />

          </div>

          <div className="mt-4">
            <TagInput
              label="Keywords"
              placeholder="Type a keyword and press Enter"
              value={keywords}
              onChange={setKeywords}
              normalise={(text) => text.toLowerCase()}
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Description / abstract"
              rows={5}
              error={
                errors.description?.message
              }
              {...register('description')}
            />
          </div>

        </Card>


        {/* Acquisition */}

        <Card title="Acquisition and circulation rules">

          <div className="grid gap-4 sm:grid-cols-2">

            <Select
              label="Acquisition source"
              options={[
                {
                  value: 'purchase',
                  label: 'Purchase',
                },
                {
                  value: 'donation',
                  label: 'Donation',
                },
                {
                  value: 'exchange',
                  label: 'Exchange',
                },
                {
                  value: 'legal_deposit',
                  label: 'Legal deposit',
                },
                {
                  value: 'internal',
                  label: 'Internal publication',
                },
                {
                  value: 'other',
                  label: 'Other',
                },
              ]}
              {...register(
                'acquisitionSource'
              )}
            />

            <Input
              label="Supplier or donor"
              error={errors.supplier?.message}
              {...register('supplier')}
            />

            <Input
              label="Purchase price"
              type="number"
              step="0.01"
              min="0"
              error={
                errors.purchasePrice?.message
              }
              {...register(
                'purchasePrice'
              )}
            />

            <Input
              label="Replacement cost"
              type="number"
              step="0.01"
              min="0"
              hint={finesEnabled ? 'Charged when a copy is lost.' : undefined}
              error={
                errors.replacementCost?.message
              }
              {...register(
                'replacementCost'
              )}
            />

          </div>

          <div className="mt-5 space-y-3 border-t border-line pt-4">

            <Checkbox
              label="Available for loan"
              {...register(
                'isBorrowable'
              )}
            />

            <Checkbox
              label="Reference only"
              {...register(
                'isReferenceOnly'
              )}
            />

          </div>

        </Card>


        {/* Action buttons */}

        <div className="flex justify-end gap-2">

          <Button
            as={Link}
            to={
              isEdit
                ? `/catalog/${id}`
                : '/catalog'
            }
            variant="secondary"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            loading={isSubmitting}
          >
            {isEdit
              ? 'Save changes'
              : 'Create record'}
          </Button>

        </div>

      </form>
    </>
  );
}