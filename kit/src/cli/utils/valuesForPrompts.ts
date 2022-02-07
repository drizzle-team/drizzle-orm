export enum Action {
  RENAME = 'RENAME',
  DELETE = 'DELETE'
}

export enum Confirmation {
  CANCEL = 'CANCEL',
  CONFIRM = 'CONFIRM'
}

export const actions = [
  {
    key: Action.RENAME,
    label: 'Renamed',
    value: Action.RENAME,
  },
  {
    key: Action.DELETE,
    label: 'Deleted',
    value: Action.DELETE,
  },
];

export const confirmations = [
  {
    key: Confirmation.CONFIRM,
    label: 'Yes',
    value: Confirmation.CONFIRM,
  },
  {
    key: Confirmation.CANCEL,
    label: 'No',
    value: Confirmation.CANCEL,
  },
];
