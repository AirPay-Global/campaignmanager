declare module 'africastalking' {
  interface Credentials {
    apiKey: string;
    username: string;
  }

  interface SMSSendOptions {
    to: string | string[];
    message: string;
    from?: string;
    enqueue?: boolean;
  }

  interface SMSRecipient {
    number: string;
    messageId: string;
    status: string;
    cost: string;
  }

  interface SMSSendResponse {
    SMSMessageData: {
      Message: string;
      Recipients: SMSRecipient[];
    };
  }

  interface SMSService {
    send(options: SMSSendOptions): Promise<SMSSendResponse>;
  }

  interface AfricasTalkingInstance {
    SMS: SMSService;
  }

  function AfricasTalking(credentials: Credentials): AfricasTalkingInstance;
  export = AfricasTalking;
}
