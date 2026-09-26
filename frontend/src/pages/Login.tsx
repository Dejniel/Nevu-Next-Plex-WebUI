import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";
import { queryBuilder } from "../plex/QuickFunctions";
import { useSearchParams } from "react-router-dom";
import { getAccessToken, getPin } from "../plex";
import axios from "axios";
import { ProxiedRequest } from "../backendURL";
import { XMLParser } from "fast-xml-parser";
import { buildPlexAuthUrl } from "../plex/auth";

export default function Login() {
  const [query] = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  useEffect(() => {
    if (!query.has("pinID")) {
      (async () => {
        const res = await getPin();

        if (!res.id || !res.code) return setError("Failed to get pin for login. Please try again.");

        const clientIdentifier = localStorage.getItem("clientID");
        if (!clientIdentifier)
          return setError("Failed to identify this client. Please try again.");

        const forwardUrl = new URL("/login", window.location.origin);
        forwardUrl.searchParams.set("pinID", String(res.id));

        window.location.href = buildPlexAuthUrl({
          clientIdentifier,
          pinCode: res.code,
          forwardUrl: forwardUrl.toString(),
        });
      })();
    }

    if (query.has("pinID")) {
      (async () => {
        try {
          const res = await getAccessToken(query.get("pinID") as string);

          if (!res.authToken)
            return setError("Failed to log in. Please try again.");

          // check token validity against the server
          // const tokenCheck = await ProxiedRequest(`/?${queryBuilder({ "X-Plex-Token": res.authToken })}`, "GET", {})

          // if (tokenCheck.status === 200) {
          //   localStorage.setItem("accessToken", res.authToken);
          //   localStorage.setItem("accAccessToken", res.authToken);
          //   window.location.href = "/";
          // }

          // console.log("2", tokenCheck);

          const serverIdentity = await ProxiedRequest("/identity", "GET", {
            "X-Plex-Token": res.authToken,
          });

          if (!serverIdentity || !serverIdentity.data.MediaContainer)
            return setError(
              `Failed to log in: ${
                serverIdentity.data.errors[0].message || "Unknown error"
              }`
            );

          const serverID = serverIdentity.data.MediaContainer.machineIdentifier;

          const parser = new XMLParser({
            attributeNamePrefix: "",
            textNodeName: "value",
            ignoreAttributes: false,
            parseAttributeValue: true,
          });

          // try getting a shared server
          const sharedServersXML = await axios.get(
            `https://plex.tv/api/resources?${queryBuilder({
              "X-Plex-Token": res.authToken,
            })}`
          );

          const sharedServers = parser.parse(sharedServersXML.data);

          let targetServer;

          if (sharedServers.MediaContainer.size === 1)
            targetServer = sharedServers.MediaContainer.Device;
          else
            targetServer = sharedServers.MediaContainer.Device.find(
              (server: any) => server.clientIdentifier === serverID
            );

          if (!targetServer)
            return setError("You do not have access to this server.");

          localStorage.setItem("accessToken", targetServer.accessToken);
          localStorage.setItem("accAccessToken", res.authToken);

          window.location.href = "/";
        } catch (e) {
          console.log(e);
          setError("Failed to log in. Please try again.");
        }
      })();
    }
  }, [query]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Collapse in={Boolean(error)}>
        <Alert severity="error">{error}</Alert>
      </Collapse>
      {!error && (
        <>
          <CircularProgress />
          <Typography
            sx={{
              fontSize: "1rem",
              fontWeight: "bold",
            }}
          >
            Logging in...
          </Typography>
        </>
      )}
    </Box>
  );
}
