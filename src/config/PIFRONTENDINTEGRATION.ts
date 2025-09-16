// import axios, { AxiosResponse } from "axios";
// import { PiNetworkService } from "./PiBackendIntegration";

// interface PaymentDTO {
//   identifier: string;
// }

// interface AuthenticateAnswer {
//   accessToken: string;
//   username: string;
//   wallet_address: string;
// }

// interface APIAnswerData {
//   username: string;
//   userUid: string;
// }
// const piNetworkService = PiNetworkService.connect();

// // Function to handle incomplete payment found
// export async function onIncompletePaymentFound(paymentDTO: PaymentDTO) {
//   const paymentId = paymentDTO.identifier;
//   await piNetworkService.cancelPiNetworkIncompletePayment(
//     paymentId,
//     paymentDTO
//   );
// }

// // Function to get user access token
// export async function getUserAccessToken(): Promise<string> {
//   await (window as any).Pi.init({ version: "2.0", sandbox: false });
//   try {
//     const answer: AuthenticateAnswer = await (window as any).Pi.authenticate(
//       ["username", "payments", "wallet_address"],
//       onIncompletePaymentFound
//     );
//     return answer.accessToken;
//   } catch (error) {
//     throw error;
//   }
// }

// // Function to get user wallet address
// export async function getUserWalletAddress(): Promise<string> {
//   try {
//     const answer: AuthenticateAnswer = await (window as any).Pi.authenticate(
//       ["username", "payments", "wallet_address"],
//       onIncompletePaymentFound
//     );
//     return answer.wallet_address;
//   } catch (error) {
//     throw error;
//   }
// }

// // Function to authenticate with Pi Network
// export async function authWithPiNetwork(): Promise<{
//   username: string;
//   data: APIAnswerData;
//   accessToken: string;
// }> {
//   try {
//     await (window as any).Pi.init({ version: "2.0", sandbox: false });
//     const answer: AuthenticateAnswer = await (window as any).Pi.authenticate(
//       ["username", "payments", "wallet_address"],
//       onIncompletePaymentFound
//     );
//     console.log(answer);
//     const APIAnswer: AxiosResponse<{ data: APIAnswerData }> = await axios.get(
//       "https://api.minepi.com/v2/me",
//       {
//         headers: {
//           Authorization: "Bearer " + answer.accessToken,
//         },
//       }
//     );

//     return { ...(APIAnswer.data as any), accessToken: answer.accessToken };
//   } catch (error) {
//     throw new Error("Error while authenticating");
//   }
// }

// // Function to create a payment
// export async function CreatePayment(
//   userUid: string,
//   amount: number,
//   action: string,
//   onPaymentSucceed: Function
// ): Promise<any> {
//   await authWithPiNetwork();
//   const paymentResult = await (window as any).Pi.createPayment(
//     {
//       amount: amount,
//       memo: "Donation to Arcadia",
//       metadata: { paymentSource: "Arcadia" },
//     },
//     {
//       onReadyForServerApproval: async (paymentId: string) => {
//         await piNetworkService.approvePiNetworkPayment(paymentId);
//       },
//       onReadyForServerCompletion: async (paymentId: string, txid: string) => {
//         await piNetworkService.completePiNetworkPayment(paymentId, txid);
//         onPaymentSucceed();
//       },
//       onCancel: async (paymentId: string) => {
//         //The payment has been cancelled
//       },
//       onError: async (error: any, paymentDTO: PaymentDTO) => {
//         console.error("Payment error:", error);
//         await piNetworkService.cancelPiNetworkPayment(paymentDTO.identifier);
//       },
//     }
//   );
//   return paymentResult;
// }
