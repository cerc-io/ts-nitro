export interface Actor {
  address: string;
  privateKey: string;
  chainPrivateKey: string;
}

export enum RateType {
  Query = 'QUERY',
  Mutation = 'MUTATION',
}

export interface RateInfo {
  type: RateType;
  name: string;
  amount: bigint;
}
