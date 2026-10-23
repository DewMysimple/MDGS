import { useEffect, useRef } from 'react';
import { RotateCcw, Settings, X } from 'lucide-react';
import { chapters } from '../data/chapters';
import { defaultViewerSettings, settingLimits, textPlateColors } from '../data/viewerSettings';
import type { ChapterViewingSettings, ViewerSettings } from '../data/viewerSettings';

interface Props {
  open: boolean;
  chapterId: number;
  settings: ViewerSettings;
  onChange: (settings: ViewerSettings) => void;
  onClose: () => void;
}

function RangeSetting({ id, label, value, limits, display, onChange }: {
  id: string; label: string; value: number; limits: { min: number; max: number; step: number };
  display: string; onChange: (value: number) => void;
}) {
  return <label className="settings-range" htmlFor={id}>
    <span>{label}<output htmlFor={id}>{display}</output></span>
    <input id={id} type="range" {...limits} value={value} onChange={event => onChange(Number(event.currentTarget.value))} />
  </label>;
}

export default function ViewerSettingsPanel({ open, chapterId, settings, onChange, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true }); };
  }, [open]);

  const updateChapter = (id: number, key: keyof ChapterViewingSettings, value: number) => onChange({
    ...settings, chapters: { ...settings.chapters, [id]: { ...settings.chapters[id], [key]: value } },
  });
  const updatePlate = <K extends keyof ViewerSettings['textPlate'],>(key: K, value: ViewerSettings['textPlate'][K]) => onChange({
    ...settings, textPlate: { ...settings.textPlate, [key]: value },
  });

  return <dialog ref={dialog} className="viewer-settings" aria-labelledby="viewer-settings-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="settings-heading">
      <div><span className="settings-eyebrow">随心舒卷</span><h2 id="viewer-settings-title"><Settings size={20} strokeWidth={1.4} />设置</h2></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置" autoFocus><X size={22} strokeWidth={1.4} /></button>
    </header>
    <div className="settings-body">
      <p className="settings-intro">调整即生效，保存在此浏览器。每卷的滚轮手感可独立设置。</p>
      <section className="settings-narrative" aria-labelledby="settings-narrative-title">
        <h3 id="settings-narrative-title">题跋随心</h3>
        <p className="settings-help">诗意短章为当代新题；原作全文可在“画外拾遗”细读。</p>
        <div className="settings-reading-modes" role="radiogroup" aria-labelledby="settings-narrative-title">
          {([
            ['poetic', '诗意短章', '以短句入画，留白相续'],
            ['original', '原作叙事', '随画读原文，可暂停细赏'],
            ['quiet', '静观画卷', '暂收题跋，只与画相对'],
          ] as const).map(([value, title, description]) => <label key={value} className={settings.narrativeMode === value ? 'is-selected' : ''}>
            <input type="radio" name="narrative-mode" value={value} checked={settings.narrativeMode === value} onChange={() => onChange({ ...settings, narrativeMode: value })} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>)}
        </div>
      </section>
      <section aria-labelledby="settings-scroll-title">
        <h3 id="settings-scroll-title">滚轮游观</h3>
        <p className="settings-help">速度越低，每次移动越细。平滑时间越长，起停越柔和；越短，跟手越快。</p>
        <div className="settings-chapters">{chapters.map(chapter => <fieldset key={chapter.id} className={chapterId === chapter.id ? 'is-current' : ''}>
          <legend>{chapter.numeral} · {chapter.title}{chapterId === chapter.id && <small>当前卷</small>}</legend>
          <RangeSetting id={`wheel-speed-${chapter.id}`} label={`${chapter.title}滚轮速度`} limits={settingLimits.wheelSpeed}
            value={settings.chapters[chapter.id].wheelSpeed} display={`${settings.chapters[chapter.id].wheelSpeed.toFixed(2)}% / 100px`}
            onChange={value => updateChapter(chapter.id, 'wheelSpeed', value)} />
          <RangeSetting id={`wheel-smoothing-${chapter.id}`} label={`${chapter.title}平滑时间`} limits={settingLimits.smoothingMs}
            value={settings.chapters[chapter.id].smoothingMs} display={`${settings.chapters[chapter.id].smoothingMs} 毫秒`}
            onChange={value => updateChapter(chapter.id, 'smoothingMs', value)} />
        </fieldset>)}</div>
      </section>
      <section aria-labelledby="settings-text-title" className="settings-text">
        <h3 id="settings-text-title">文字底板</h3>
        <p className="settings-help">调整画卷题跋、导航与控件的文字衬底。</p>
        <label className="settings-color" htmlFor="text-plate-color"><span>底板颜色</span><span><select id="text-plate-color" value={settings.textPlate.color} onChange={event => updatePlate('color', event.currentTarget.value)}>{textPlateColors.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select><output htmlFor="text-plate-color">{settings.textPlate.color.toUpperCase()}</output></span></label>
        <RangeSetting id="text-plate-opacity" label="底板不透明度" limits={settingLimits.opacity} value={settings.textPlate.opacity} display={`${Math.round(settings.textPlate.opacity * 100)}%`} onChange={value => updatePlate('opacity', value)} />
        <RangeSetting id="text-plate-padding" label="底板留白" limits={settingLimits.padding} value={settings.textPlate.padding} display={`${settings.textPlate.padding} px`} onChange={value => updatePlate('padding', value)} />
        <RangeSetting id="text-plate-radius" label="底板圆角" limits={settingLimits.radius} value={settings.textPlate.radius} display={`${settings.textPlate.radius} px`} onChange={value => updatePlate('radius', value)} />
        <RangeSetting id="text-plate-border" label="边框浓度" limits={settingLimits.borderOpacity} value={settings.textPlate.borderOpacity} display={`${Math.round(settings.textPlate.borderOpacity * 100)}%`} onChange={value => updatePlate('borderOpacity', value)} />
        <div className="settings-preview"><span>壹 · 神都花事</span><p>花开时节动京城</p><small>文字底板预览</small></div>
      </section>
    </div>
    <footer className="settings-footer"><button type="button" className="text-button" onClick={() => onChange(defaultViewerSettings())}><RotateCcw size={15} />恢复全部默认</button><button type="button" className="settings-done" onClick={onClose}>完成</button></footer>
  </dialog>;
}
