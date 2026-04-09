export interface AmplitudeUserProperties {
  $set?: Record<string, unknown>;
  $setOnce?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
  $add?: Record<string, unknown>;
}

export interface AmplitudeEvent {
  event_type: string;
  user_id?: string;
  user_properties?: AmplitudeUserProperties;
}

export interface AmplitudeResult {
  code: number;
  event: AmplitudeEvent;
  message: string;
}

export interface ChameleonSDK {
  identify: (uid: string, properties: Record<string, unknown>) => void;
}

export interface ChameleonWindow extends Window {
  chmln?: ChameleonSDK;
}
