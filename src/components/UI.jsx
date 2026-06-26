import React from 'react'

export function Button({ children, onClick, variant = 'primary', disabled, className = '', style = {}, type = 'button' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    borderRadius: 12, fontFamily: 'inherit', fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    transition: 'opacity 0.15s, transform 0.1s', fontSize: 14,
    padding: '10px 20px', opacity: disabled ? 0.5 : 1,
  }
  const variants = {
    primary: { background: '#534AB7', color: '#fff' },
    secondary: { background: 'transparent', color: '#534AB7', border: '1px solid #534AB7' },
    ghost: { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(255,255,255,0.2)' },
    danger: { background: '#E24B4A', color: '#fff' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  )
}

export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface-card)',
        border: '0.5px solid var(--border)',
        borderRadius: 16,
        padding: '20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'border-color 0.15s' : undefined,
        ...style
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = '#7F77DD')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {children}
    </div>
  )
}

export function Avatar({ name, photo, size = 40, style = {} }) {
  const colors = [
    ['#EEEDFE','#3C3489'], ['#E1F5EE','#085041'], ['#FAECE7','#4A1B0C'],
    ['#E6F1FB','#042C53'], ['#FAEEDA','#412402'], ['#FBEAF0','#4B1528']
  ]
  const idx = name ? name.charCodeAt(0) % colors.length : 0
  const [bg, fg] = colors[idx]
  return photo
    ? <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, ...style }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: size * 0.38, flexShrink: 0, ...style }}>{name?.[0]?.toUpperCase()}</div>
}

export function Tag({ children, style = {} }) {
  return (
    <span style={{ fontSize: 11, padding: '3px 10px', background: '#EEEDFE', color: '#3C3489', borderRadius: 100, fontWeight: 500, ...style }}>
      {children}
    </span>
  )
}

export function Input({ label, value, onChange, placeholder, type = 'text', style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '10px 14px', borderRadius: 10, border: '0.5px solid var(--border)',
          background: 'var(--surface-input)', color: 'var(--text-primary)',
          fontFamily: 'inherit', fontSize: 14, outline: 'none', transition: 'border-color 0.15s',
          ...style
        }}
        onFocus={e => e.target.style.borderColor = '#534AB7'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

export function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
      {children}
    </p>
  )
}

export function Spinner({ size = 32, color = '#534AB7' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `3px solid ${color}22`,
      borderTopColor: color,
      animation: 'spin 0.9s linear infinite',
      flexShrink: 0
    }} />
  )
}
