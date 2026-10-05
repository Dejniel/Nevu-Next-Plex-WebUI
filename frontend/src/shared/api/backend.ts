import axios from "axios";

export function getBackendURL() {
    return "";
}

export function ProxiedRequest(url: string, method: "GET" | "POST" | "PUT", headers?: Record<string, string>, data?: any) {
    return axios.post(`${getBackendURL()}/proxy`, { url, method, headers, data }).catch((err) => {
        console.log(err);
        return { status: err.response?.status || 500, data: err.response?.data || 'Internal server error' }
    })
}
