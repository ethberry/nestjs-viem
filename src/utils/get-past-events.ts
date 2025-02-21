import { Hash, parseAbiItem, PublicClient } from "viem";

export const getPastEvents = async (
  client: PublicClient,
  address: Array<Hash>,
  allSignatures: Array<string>,
  fromBlockNumber: bigint,
  toBlockNumber: bigint,
  chunkSize = 0,
) => {
  const totalBlocks = toBlockNumber - fromBlockNumber;
  const chunks = [];

  if (chunkSize > 0 && totalBlocks > chunkSize) {
    const count = totalBlocks / BigInt(chunkSize);
    let startingBlock = fromBlockNumber;

    for (let index = 0n; index < count; index++) {
      const fromRangeBlock = startingBlock;
      const toRangeBlock = index === count - 1n ? toBlockNumber : startingBlock + BigInt(chunkSize);
      startingBlock = toRangeBlock;

      chunks.push({ fromBlock: fromRangeBlock, toBlock: toRangeBlock });
    }
  } else {
    chunks.push({ fromBlock: fromBlockNumber, toBlock: toBlockNumber });
  }

  const topics = allSignatures.map(signature => parseAbiItem(`event ${signature}`));

  const events = [];
  for (const chunk of chunks) {
    const logs = await client.getLogs({
      address,
      events: topics,
      fromBlock: chunk.fromBlock,
      toBlock: chunk.toBlock,
    });

    if (logs?.length) {
      events.push(...logs);
    }
  }

  return events;
};
