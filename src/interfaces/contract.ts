import { Abi } from "abitype";

export interface IContractOptions {
  contractType: string;
  contractAddress: Array<string>;
  contractInterface: Abi;
  eventSignatures: Array<string>;
}
