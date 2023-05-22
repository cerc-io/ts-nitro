import { Objective } from '../../protocols/interfaces';

// PolicyMaker is used to decide whether to approve or reject an objective
export interface PolicyMaker {
  shouldApprove (o: Objective): boolean
}
