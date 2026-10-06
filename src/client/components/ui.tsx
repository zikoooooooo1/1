import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
  LoaderCircle,
  Check,
  Upload,
} from 'lucide-react';
import { useLocale } from '../i18n/index';
import { api, useData, useDebounce } from '../api';
import { catalog, type Field } from '../../shared/catalog';
export function Button({
  children,
  variant = 'primary',
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ''}`}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function ErrorBox({ error, retry }: { error: any; retry?: () => void }) {
  const { t } = useLocale();
  return (
    <div role="alert" className="alert error">
      <AlertCircle size={18} />
      <div>
        {t(error.code || error.message || 'server_error')}
        {error.requestId && <small dir="ltr">{error.requestId}</small>}
        {retry && (
          <button className="text-button" onClick={retry}>
            {t('retry')}
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  const { t } = useLocale();
  return (
    <div className="loading" role="status" aria-label={t('loading')}>
      <div className="skeleton wide" />
      <div className="skeleton" />
      <div className="skeleton wide" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
export function Empty({
  title = 'empty',
  description = 'empty_description',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Inbox size={25} />
      </div>
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
      {action}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  const { t } = useLocale();
  return <span className={`badge badge-${value}`}>{t(value)}</span>;
}
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  const { t } = useLocale();
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{t(eyebrow)}</div>}
        <h1>{t(title)}</h1>
        {description && <p>{t(description)}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </header>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLocale();
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', handler);
    return () => {
      el.removeEventListener('cancel', handler);
      el.close();
    };
  }, [onClose]);
  return (
    <dialog ref={ref} className={wide ? 'modal wide-modal' : 'modal'} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label={t('close')} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Pagination({
  page,
  total,
  limit,
  setPage,
}: {
  page: number;
  total: number;
  limit: number;
  setPage: (n: number) => void;
}) {
  const { t, number } = useLocale();
  return (
    <div className="pagination">
      <span>
        {number(total)} {t('records')}
      </span>
      <div>
        <Button
          variant="ghost"
          type="button"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label={t('previous')}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>
          {t('page')} {number(page)} {t('of')} {number(Math.max(1, Math.ceil(total / limit)))}
        </span>
        <Button
          variant="ghost"
          type="button"
          disabled={page * limit >= total}
          onClick={() => setPage(page + 1)}
          aria-label={t('next')}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
export function SearchInput({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const { t } = useLocale();
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={t('search')}
        placeholder={t('search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Table({
  rows,
  columns,
  onRow,
  actions,
}: {
  rows: any[];
  columns: string[];
  onRow?: (r: any) => void;
  actions?: (r: any) => React.ReactNode;
}) {
  const { t, formatDate, number } = useLocale();
  const cell = (row: any, key: string) => {
    const v = row[key];
    if (v === null || v === undefined || v === '') return <span className="muted">—</span>;
    if (key === 'status' || key === 'role') return <Badge value={v} />;
    if (key === 'day') return t(String(v));
    if (row[key + '_label']) return row[key + '_label'];
    if (key.endsWith('_at') || key.endsWith('_date') || ['date', 'deadline'].includes(key))
      return formatDate(v, key.endsWith('_at'));
    if (typeof v === 'number') return number(v);
    if (['type', 'difficulty', 'audience_type', 'entity_type', 'action'].includes(key)) return t(v);
    return String(v);
  };
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{t(c)}</th>
            ))}
            {actions && (
              <th>
                <span className="sr-only">{t('actions')}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map((c, index) => (
                <td key={c}>
                  {index === 0 && onRow ? (
                    <button className="row-link" onClick={() => onRow(row)}>
                      {cell(row, c)}
                    </button>
                  ) : (
                    cell(row, c)
                  )}
                </td>
              ))}
              {actions && <td className="row-actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function RefSelect({
  entity,
  value,
  onChange,
  required = false,
  name,
}: {
  entity: string;
  value: string;
  onChange: (s: string) => void;
  required?: boolean;
  name: string;
}) {
  const { t } = useLocale();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounce(q);
  const people = ['students', 'teachers', 'people', 'contacts'].includes(entity);
  const path = entity === 'contacts' ? '/contacts' : people ? '/people' : '/records/' + entity;
  const data = useData<any>(
    `${path}?q=${encodeURIComponent(query)}&page=${page}&limit=25${['students', 'teachers'].includes(entity) ? '&role=' + (entity === 'students' ? 'student' : 'teacher') : ''}`,
  );
  const rows = Array.isArray(data.data) ? data.data : data.data?.items || [];
  return (
    <div className="ref-select">
      <input
        aria-label={`${t('search')} ${t(name)}`}
        placeholder={t('search')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <select
        aria-label={t(name)}
        value={value || ''}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('select')}</option>
        {value && !rows.some((r: any) => r.id === value) && <option value={value}>{value}</option>}
        {rows.map((r: any) => (
          <option key={r.id} value={r.id}>
            {r.name || r.title || r.prompt}
          </option>
        ))}
      </select>
      {data.loading && <small>{t('loading')}</small>}
      {data.error && <ErrorBox error={data.error} />}{' '}
      {!Array.isArray(data.data) && data.data?.total > 25 && (
        <div className="select-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('previous')}
          </button>
          <button
            type="button"
            disabled={page * 25 >= data.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
export function FileField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const { t, number } = useLocale();
  const [state, set] = useState<{ busy: boolean; error: any; name: string; size: number }>({
    busy: false,
    error: null,
    name: '',
    size: 0,
  });
  async function upload(file: File) {
    set({ busy: true, error: null, name: file.name, size: file.size });
    const body = new FormData();
    body.append('file', file);
    try {
      const result = await api('/files', { method: 'POST', body });
      onChange(result.id);
      set((s) => ({ ...s, busy: false }));
    } catch (error) {
      set((s) => ({ ...s, busy: false, error }));
    }
  }
  return (
    <div className="file-field">
      <label className="upload-label">
        <Upload size={18} />
        <span>{state.busy ? t('uploading') : t('file_id')}</span>
        <input
          type="file"
          aria-label={t('file_id')}
          accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
          disabled={state.busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </label>
      <small>{t('file_help')}</small>
      {state.name && (
        <small>
          {state.name} · {number(Math.ceil(state.size / 1024))} KB
        </small>
      )}
      {state.error && <ErrorBox error={state.error} />}{' '}
      {value && !state.busy && (
        <span className="success-inline">
          <Check size={14} />
          {t('uploaded')}{' '}
          <button type="button" onClick={() => onChange('')}>
            {t('clear')}
          </button>
        </span>
      )}
    </div>
  );
}
export function Form({
  fields,
  initial = {},
  onSave,
  submitLabel = 'save',
  idPrefix = 'field',
  onCancel,
  children,
}: {
  children?: React.ReactNode;
  fields: Field[];
  idPrefix?: string;
  initial?: any;
  onSave: (data: any) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const { t } = useLocale();
  const [values, set] = useState<any>(() =>
    Object.fromEntries(
      fields.map((f) => {
        let v = initial[f.key] ?? (f.type === 'checkbox' ? 0 : f.type === 'number' ? 1 : '');
        if (f.type === 'datetime-local' && v) {
          const d = new Date(v);
          v = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        return [f.key, v];
      }),
    ),
  );
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const change = (k: string, v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...values };
      for (const f of fields) {
        if (f.type === 'number') payload[f.key] = Number(payload[f.key]);
        if (f.type === 'datetime-local' && payload[f.key])
          payload[f.key] = new Date(payload[f.key]).toISOString();
        if (f.type === 'checkbox') payload[f.key] = payload[f.key] ? 1 : 0;
      }
      await onSave(payload);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form">
      <fieldset disabled={busy}>
        <div className="form-grid">
          {fields.map((f) => (
            <div
              key={f.key}
              className={`field ${['textarea', 'file'].includes(f.type || '') ? 'full' : ''}`}
            >
              <label htmlFor={idPrefix + '-' + f.key}>
                {t(f.key)}{' '}
                {f.required ? (
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                ) : (
                  <small>{t('optional')}</small>
                )}
              </label>
              {f.ref ? (
                <RefSelect
                  entity={f.ref}
                  name={f.key}
                  value={values[f.key]}
                  required={f.required}
                  onChange={(v) => change(f.key, v)}
                />
              ) : f.key === 'audience_id' && values.audience_type !== 'school' ? (
                <RefSelect
                  name={f.key}
                  entity={
                    (
                      {
                        class: 'classes',
                        grade: 'grades',
                        section: 'sections',
                        track: 'tracks',
                        user: 'people',
                      } as any
                    )[values.audience_type] || 'classes'
                  }
                  value={values[f.key]}
                  onChange={(v) => change(f.key, v)}
                />
              ) : f.type === 'file' ? (
                <FileField value={values[f.key]} onChange={(v) => change(f.key, v)} />
              ) : f.type === 'textarea' ? (
                <textarea
                  id={idPrefix + '-' + f.key}
                  required={f.required}
                  rows={4}
                  maxLength={20000}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                />
              ) : f.options ? (
                <select
                  id={idPrefix + '-' + f.key}
                  required={f.required}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                >
                  <option value="">{t('select')}</option>
                  {f.options.map((v) => (
                    <option key={v} value={v}>
                      {t(v)}
                    </option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <input
                  id={idPrefix + '-' + f.key}
                  type="checkbox"
                  checked={!!values[f.key]}
                  onChange={(e) => change(f.key, e.target.checked ? 1 : 0)}
                />
              ) : (
                <input
                  id={idPrefix + '-' + f.key}
                  type={f.type || 'text'}
                  autoComplete={
                    f.autoComplete ||
                    (f.key === 'current_password'
                      ? 'current-password'
                      : f.type === 'password'
                        ? 'new-password'
                        : undefined)
                  }
                  minLength={
                    f.minLength ??
                    (f.key === 'current_password' ? 1 : f.type === 'password' ? 12 : undefined)
                  }
                  maxLength={f.type === 'password' ? 128 : 500}
                  min={f.min}
                  max={f.max}
                  required={f.required}
                  value={values[f.key]}
                  onChange={(e) => change(f.key, e.target.value)}
                />
              )}{' '}
              {f.type === 'datetime-local' && <small>{t('time_input_help')}</small>}
              {f.key === 'options' && <small>{t('options_help')}</small>}
              {f.type === 'password' &&
                f.autoComplete !== 'current-password' &&
                f.key !== 'current_password' && <small>{t('password_help')}</small>}
            </div>
          ))}
        </div>
        {children}
      </fieldset>
      {error && <ErrorBox error={error} />}
      <div className="form-actions">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
        <Button type="submit" busy={busy}>
          {t(submitLabel)}
        </Button>
      </div>
    </form>
  );
}
export function entityFields(entity: string, role: string) {
  return catalog[entity].fields.map((f) =>
    entity === 'announcements' && f.key === 'audience_type' && role === 'teacher'
      ? { ...f, options: ['class'] }
      : f,
  );
}
