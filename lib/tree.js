import { printCSTML as printCSTMLFromStream, streamFromTree } from '@bablr/agast-helpers/stream';
import { freeze, freezeRecord } from '@bablr/agast-helpers/object';

export const printCSTML = (rootNode, options = freezeRecord({})) => {
  return printCSTMLFromStream(streamFromTree(rootNode), options);
};
