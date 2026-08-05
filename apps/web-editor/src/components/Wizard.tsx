import { useState } from 'react'
import { WizardConfig } from '../wizard'

interface WizardProps {
  open: boolean
  onCreate: (cfg: WizardConfig) => void
  onClose: () => void
}

const genres = [
  { id: 'collector', emoji: '🪙', label: 'Собиратель' },
  { id: 'race', emoji: '🏁', label: 'Гонка' },
  { id: 'catch', emoji: '👾', label: 'Догонялки' },
  { id: 'clicker', emoji: '🎯', label: 'Кликер' },
  { id: 'explore', emoji: '🌍', label: 'Исследование' }
]

const sizes = [
  { id: 'small', label: 'Маленькая', hint: 'мало объектов' },
  { id: 'medium', label: 'Средняя', hint: 'средний мир' },
  { id: 'large', label: 'Большая', hint: 'большой мир' }
]

export function Wizard({ open, onCreate, onClose }: WizardProps) {
  const [kind, setKind] = useState<'game' | 'scene'>('game')
  const [genre, setGenre] = useState<string>('collector')
  const [size, setSize] = useState<string>('small')

  if (!open) return null

  const card = (active: boolean): any => ({
    background: active ? '#094771' : '#2d2d30',
    border: `2px solid ${active ? '#1177bb' : '#3e3e42'}`,
    borderRadius: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: 13
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50
      }}
    >
      <div
        style={{
          width: 640,
          maxWidth: '92vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#252526',
          border: '1px solid #3e3e42',
          borderRadius: 14,
          padding: 22
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>✨ Создать проект</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          Выбери цель — движок соберёт готовую заготовку с объектами и логикой!
        </div>

        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Тип проекта</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={card(kind === 'game')} onClick={() => setKind('game')}>🎮 Игра</div>
          <div style={card(kind === 'scene')} onClick={() => setKind('scene')}>🏞 3D-сцена</div>
          <div style={{ ...card(false), opacity: 0.4, cursor: 'not-allowed' }}>🪑 Мебель (скоро)</div>
          <div style={{ ...card(false), opacity: 0.4, cursor: 'not-allowed' }}>🏢 Здание (скоро)</div>
          <div style={{ ...card(false), opacity: 0.4, cursor: 'not-allowed' }}>🌆 Город (скоро)</div>
          <div style={{ ...card(false), opacity: 0.4, cursor: 'not-allowed' }}>🪐 Планета (скоро)</div>
        </div>

        {kind === 'game' && (
          <>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Жанр</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {genres.map((g) => (
                <div key={g.id} style={card(genre === g.id)} onClick={() => setGenre(g.id)}>
                  <div style={{ fontSize: 22 }}>{g.emoji}</div>
                  {g.label}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Размер</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {sizes.map((s) => (
            <div key={s.id} style={card(size === s.id)} onClick={() => setSize(s.id)}>
              <div style={{ fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{s.hint}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn"
            style={{ background: '#16825d', fontSize: 14, padding: '10px 18px' }}
            onClick={() => onCreate({ kind, genre, size } as WizardConfig)}
          >
            ✨ Создать проект
          </button>
          <button className="btn" style={{ background: '#3e3e42' }} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
