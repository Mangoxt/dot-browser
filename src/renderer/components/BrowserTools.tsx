import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import { Plus, Puzzle } from 'lucide-react';
import type { ExtensionSummary } from '../../shared/extensions';
import { chromeStoreId } from '../../shared/extensions';
import { command, useBrowser } from '../stores/browser';
import type { Command } from '../../shared/ipc';

const builtins = [
  {
    id: 'night' as const,
    name: 'Gece görünümü',
    description: 'Açık renkli sayfaları koyulaştırır. Bazı sitelerde renkler farklı görünebilir.',
  },
  {
    id: 'scroll' as const,
    name: 'Başa dön',
    description: 'Uzun sayfalarda tek tıkla başa dönmek için küçük bir düğme ekler.',
  },
];
export function Extensions() {
  const [storeURL, setStoreURL] = useState('');
  const { state } = useBrowser();
  const [items, setItems] = useState<ExtensionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    void command({ type: 'extension.list' }).then((r) => {
      setItems(r.extensions || []);
      if (!r.ok) setError(r.error || 'Eklentiler yüklenemedi.');
    });
  }, []);
  const run = async (c: Command) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await command(c);
      if (result.ok) {
        setItems(result.extensions || []);
        setMessage(
          'Değişiklikler kaydedildi. Açık sayfalarda etkisini görmek için sayfayı yenileyin.',
        );
      } else setError(result.error || 'Eklenti yüklenemedi.');
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || !!state?.private;
  return (
    <div className="extension-manager">
      <p className="muted">
        {tr(
          'Add extensions from the Chrome Web Store or a folder. Some Chrome APIs are unavailable; compatibility varies by extension.',
        )}
      </p>
      <button
        className="primary"
        disabled={disabled}
        onClick={() => {
          void command({ type: 'tab.new', url: 'https://chromewebstore.google.com/' });
          useBrowser.getState().open(null);
        }}
      >
        <Puzzle size={15} />
        {tr('Open Chrome Web Store')}
      </button>{' '}
      <form
        className="store-install-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (chromeStoreId(storeURL)) void run({ type: 'extension.store', url: storeURL });
        }}
      >
        <input
          aria-label={tr('Chrome Web Store link')}
          placeholder={tr('Paste an extension link')}
          value={storeURL}
          onChange={(event) => setStoreURL(event.target.value.trim())}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !chromeStoreId(storeURL)}>
          {tr(busy ? 'Loading…' : 'Add extension')}
        </button>
      </form>
      {state?.private && (
        <p className="modal-hint">
          {tr('Eklentiler gizli pencerelerde çalışmaz. Yönetmek için normal pencereye geçin.')}
        </p>
      )}
      <button disabled={disabled} onClick={() => void run({ type: 'extension.install' })}>
        <Plus size={15} />
        {tr('Klasörden eklenti ekle')}
      </button>
      <h3>{tr('Hazır eklentiler')}</h3>
      {builtins.map((builtin) => (
        <div className="extension-card" key={builtin.id}>
          <Puzzle size={22} />
          <div>
            <strong>{tr(builtin.name)}</strong>
            <p>{tr(builtin.description)}</p>
          </div>
          <button
            disabled={disabled || items.some((i) => i.builtin === builtin.id)}
            onClick={() => void run({ type: 'extension.install', builtin: builtin.id })}
          >
            {items.some((i) => i.builtin === builtin.id) ? tr('Eklendi') : tr('Ekle')}
          </button>
        </div>
      ))}
      <h3>
        {tr('Eklenen eklentiler')}
        <span className="badge">{items.length}</span>
      </h3>
      {!items.length && (
        <p className="muted">
          {tr('Henüz eklenti eklenmedi. Eklentiler yalnızca siz eklediğinizde etkinleşir.')}
        </p>
      )}
      {items.map((item) => (
        <div className="extension-card installed" key={item.id}>
          <Puzzle size={22} />
          <div>
            <strong>
              {item.builtin ? tr(item.name) : item.name} <small>{item.version}</small>
            </strong>
            <p>{item.builtin ? tr(item.description) : item.description}</p>
            {item.error && <p role="alert">{tr(item.error)}</p>}
            <label className="extension-toggle">
              <input
                type="checkbox"
                checked={item.enabled}
                disabled={disabled}
                onChange={() =>
                  void run({
                    type: 'extension.action',
                    id: item.id,
                    action: item.enabled ? 'disable' : 'enable',
                  })
                }
              />{' '}
              {item.enabled ? tr('Etkin') : tr('Kapalı')}
            </label>
          </div>
          <button
            disabled={disabled}
            onClick={() => void run({ type: 'extension.action', id: item.id, action: 'remove' })}
          >
            {tr('Kaldır')}
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {message && (
        <p role="status" className="modal-hint">
          {tr(message)}
        </p>
      )}
      <p className="modal-hint">
        {tr(
          'Yalnızca güvendiğiniz eklentileri yükleyin; eklentiler ziyaret ettiğiniz sayfalara erişebilir.',
        )}
      </p>
    </div>
  );
}
