import { streamFromTree } from '@bablr/agast-helpers/tree';

import { printPrettyCSTML as printPrettyCSTMLFromStream } from './stream.js';

export const printPrettyCSTML = (rootNode, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};
