const unavailable = async () => {
  throw new Error("This integration is not available in the self-hosted build.");
};

export const Core = {};
export const InvokeLLM = unavailable;
export const SendEmail = unavailable;
export const SendSMS = unavailable;
export const UploadFile = unavailable;
export const GenerateImage = unavailable;
export const ExtractDataFromUploadedFile = unavailable;
