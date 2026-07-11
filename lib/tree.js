import { printCSTML as printCSTMLFromStream, streamFromTree } from '@bablr/agast-helpers/stream';
import { freeze } from '@bablr/agast-helpers/object';

export const printCSTML = (rootNode, options = {}) => {
  return printCSTMLFromStream(streamFromTree(rootNode), options);
};
