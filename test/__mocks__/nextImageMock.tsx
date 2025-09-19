import * as React from 'react';

// Simple mock for next/image to behave like a normal img in tests
const NextImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => {
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img {...props} />;
};

export default NextImage;
