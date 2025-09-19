import * as React from 'react';

type Props = React.PropsWithChildren<{ href: string; className?: string; [k: string]: any }>

const Link: React.FC<Props> = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export default Link;
