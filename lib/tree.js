import {
  printPrettyCSTML as printPrettyCSTMLFromStream,
  streamFromTree,
} from '@bablr/agast-helpers/stream';
import { freeze } from '@bablr/agast-helpers/object';

export const printPrettyCSTML = (rootNode, options = freeze({})) => {
  return printPrettyCSTMLFromStream(streamFromTree(rootNode), options);
};
