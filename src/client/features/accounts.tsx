import { useState } from 'react';
import { roles } from '../../shared/roles';
import { mutate } from '../api';
import { useLocale } from '../i18n/index';
import { Button, Form, Modal } from '../components/ui';
export function RoleChange({ person, onDone }: { person: any; onDone: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <section className="section-gap">
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {t('change_role')}
      </Button>
      {open && (
        <>
          <p>{t('change_role_help')}</p>
          <Form
            idPrefix="role-change"
            fields={[
              {
                key: 'role',
                type: 'select',
                required: true,
                options: person.auth_provider === 'microsoft' ? ['student'] : [...roles],
              },
              { key: 'current_password', type: 'password', required: true },
            ]}
            initial={{ role: person.role }}
            submitLabel="change_role"
            onSave={async (body) => {
              if (
                !window.confirm(
                  `${t('confirm_role_change')}\n${person.name}: ${t(person.role)} → ${t(body.role)}`,
                )
              )
                return;
              await mutate(`/people/${person.id}/role`, { ...body, version: person.version });
              onDone();
            }}
          />
        </>
      )}
    </section>
  );
}
export function MicrosoftAccount({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useLocale();
  return (
    <Modal title={t('create_microsoft_student')} onClose={onClose}>
      <p>{t('microsoft_preapproval_help')}</p>
      <Form
        fields={[
          { key: 'name', required: true },
          { key: 'email', type: 'email', required: true },
          { key: 'object_id', required: true },
        ]}
        onCancel={onClose}
        submitLabel="create"
        onSave={async (body) => {
          await mutate('/people/microsoft', body);
          onDone();
        }}
      />
    </Modal>
  );
}
