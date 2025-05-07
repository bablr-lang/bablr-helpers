import { streamFromTree } from '@bablr/agast-helpers/tree';
import { printPrettyCSTML as printPrettyCSTMLFromStream } from '@bablr/agast-helpers/stream';

export const printPrettyCSTML = (rootNode, options = {}) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};
