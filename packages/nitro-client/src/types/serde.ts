export class JsonRpcError extends Error {
  private code?: number;

  private data?: any;

  private id?: number;

  constructor({
    message, code, data, id,
  }: { message: string; code?: number; data?: any; id?: number }) {
    super(message);
    this.code = code;
    this.data = data;
    this.id = id;
  }

  error(): string {
    return this.message;
  }
}

export const ParseError = new JsonRpcError({ message: 'Parse error', code: -32700 });
export const InvalidRequestError = new JsonRpcError({ message: 'Invalid Request', code: -32600 });
export const MethodNotFoundError = new JsonRpcError({ message: 'Method not found', code: -32601 });
export const InvalidParamsError = new JsonRpcError({ message: 'Invalid params', code: -32602 });
export const InternalServerError = new JsonRpcError({ message: 'Internal error', code: -32603 });
export const UnexpectedRequestUnmarshalError = new JsonRpcError({ message: 'Could not unmarshal request object', code: -32010 });
export const UnexpectedRequestUnmarshalError2 = new JsonRpcError({ message: 'Could not unmarshal params object', code: -32009 });
