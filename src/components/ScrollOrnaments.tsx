/**
 * Decorative mounting, separate from the painting and its pointer surface.
 * All colours, dimensions and positioning live in the shared stylesheet.
 */
export function ScrollRoller({ side }: { side: 'left' | 'right' }) {
  return <div className={`scroll-roller scroll-roller--${side}`} aria-hidden="true">
    <span className="scroll-roller__finial scroll-roller__finial--top" />
    <span className="scroll-roller__neck scroll-roller__neck--top" />
    <span className="scroll-roller__band scroll-roller__band--top" />
    <span className="scroll-roller__paper"><span className="scroll-roller__paper-grain" /></span>
    <span className="scroll-roller__band scroll-roller__band--bottom" />
    <span className="scroll-roller__neck scroll-roller__neck--bottom" />
    <span className="scroll-roller__finial scroll-roller__finial--bottom" />
  </div>;
}

export function BrocadeBorder({ edge }: { edge: 'top' | 'bottom' }) {
  return <div className={`brocade-border brocade-border--${edge}`} aria-hidden="true">
    <span className="brocade-border__pattern" />
    <span className="brocade-border__selvage brocade-border__selvage--outer" />
    <span className="brocade-border__selvage brocade-border__selvage--inner" />
  </div>;
}

export function ExhibitionAtmosphere() {
  return <div className="exhibition-atmosphere" aria-hidden="true">
    <img className="exhibition-atmosphere__peonies" src={`${import.meta.env.BASE_URL}ui/peony-line.svg`} alt="" />
    <img className="exhibition-atmosphere__cloud exhibition-atmosphere__cloud--left" src={`${import.meta.env.BASE_URL}ui/cloud-line.svg`} alt="" />
    <img className="exhibition-atmosphere__cloud exhibition-atmosphere__cloud--right" src={`${import.meta.env.BASE_URL}ui/cloud-line.svg`} alt="" />
    <img className="exhibition-atmosphere__mountains" src={`${import.meta.env.BASE_URL}ui/distant-mountains.svg`} alt="" />
    <div className="exhibition-atmosphere__table">
      <span className="exhibition-atmosphere__table-edge" />
      <span className="exhibition-atmosphere__table-grain" />
    </div>
  </div>;
}
