import { streamFromTree } from '@bablr/agast-helpers/tree';
import { printPrettyCSTML as printPrettyCSTMLFromStream } from '@bablr/agast-helpers/stream';
import { freeze } from '@bablr/agast-helpers/object';

export const printPrettyCSTML = (rootNode, options = freeze({})) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};
