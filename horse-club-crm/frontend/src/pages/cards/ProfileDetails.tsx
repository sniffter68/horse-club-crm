import { useId, type ReactNode } from 'react'
import { Typography } from 'antd'

export function ProfileHeader({ title, name, badges, actions }: {
  title: string; name: string; badges?: ReactNode; actions?: ReactNode
}) {
  return <div className="profile-header" role="group" aria-label={title}>
    <div className="profile-header__identity">
      <Typography.Text type="secondary" className="profile-header__eyebrow">{title}</Typography.Text>
      <div className="profile-header__name"><h2>{name}</h2><div className="profile-header__badges">{badges}</div></div>
    </div>
    <div className="profile-header__actions">{actions}</div>
  </div>
}

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return <section className="profile-section" aria-labelledby={id}>
    <h3 id={id}>{title}</h3>{children}
  </section>
}

export function ProfileFields({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="profile-fields">{items.map(item => <div className="profile-fields__item" key={item.label}>
    <dt><Typography.Text type="secondary">{item.label}</Typography.Text></dt><dd>{item.value ?? '—'}</dd>
  </div>)}</dl>
}
