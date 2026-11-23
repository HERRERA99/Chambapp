import { Fragment } from 'react';
import { Icon } from './Icon';

/** A path through menus («Ajustes › Datos») with the chevron icon, never a text arrow. */
export function MenuPath({ parts }: { parts: readonly string[] }) {
  return (
    <strong className="menu-path">
      {parts.map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {index > 0 ? <Icon name="right" size={12} className="menu-path__sep" /> : null}
          <span>{part}</span>
        </Fragment>
      ))}
    </strong>
  );
}
