import { Objective, ObjectiveStatus } from '../../protocols/interfaces';

// PolicyMaker is used to decide whether to approve or reject an objective
export interface PolicyMaker {
  shouldApprove (o: Objective): boolean
}

// PermissivePolicy is a policy maker that decides to approve every unapproved objective
export class PermissivePolicy {
  // ShouldApprove decides to approve o if it is currently unapproved
  shouldApprove(o: Objective): boolean {
    return o.getStatus() === ObjectiveStatus.Unapproved;
  }
}
