import axios from "axios";
import { toast } from "react-hot-toast";

const apiClient = axios.create({
  baseURL: "/api",
});

apiClient.interceptors.response.use(
  function (response) {
    return response.data;
  },
  function (error) {
    const message =
      error?.response?.data?.error || error.message || error.toString();

    console.error(message);

    if (message) {
      toast.error(message);
    } else {
      toast.error("Something went wrong...");
    }

    return Promise.reject(error);
  }
);

export default apiClient;
