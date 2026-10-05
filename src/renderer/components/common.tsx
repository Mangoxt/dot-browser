import { Globe, LoaderCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
export function IconButton({
  icon: Icon,
  label,
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      {...props}
      className={`icon-button ${active ? 'active' : ''} ${props.className ?? ''}`}
      title={label}
      aria-label={label}
    >
      <Icon size={16} />
    </button>
  );
}
export function Favicon({
  url,
  loading = false,
  size = 16,
}: {
  url?: string;
  loading?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return loading ? (
    <LoaderCircle size={size} className="spin" />
  ) : url && !failed ? (
    <img
      className="favicon"
      width={size}
      height={size}
      src={url}
      referrerPolicy="no-referrer"
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <Globe size={size} />
  );
}
export function Empty({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`toggle ${checked ? 'checked' : ''}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function bytes(n: number) {
  if (!n) return '0 B';
  const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
