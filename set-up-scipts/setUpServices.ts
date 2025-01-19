import { envManager } from "./env";
import axios from "axios";
import { s3 } from "./utils/s3-config";

const createBucket = async (bucketName: string) => {
  try {
    const params = {
      Bucket: bucketName,
    };
    const result = await s3.createBucket(params).promise();
    cons.log(`Bucket "${bucketName}" created successfully:`, result);
  } catch (error) {
    console.error("Error creating bucket:", error);
    throw error; 
  }
};

const keycloakUrl = envManager.get("KEYCLOAK_URL");
const adminUsername = envManager.get("KC_ADMIN_USERNAME");
const adminPassword = envManager.get("KC_ADMIN_PASSWORD");
const clientId = envManager.get("KC_CLIENT_ID");

async function getAdminToken() {
  try {
    const response = await axios.post(
      `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        client_id: clientId,
        username: adminUsername,
        password: adminPassword,
        grant_type: "password",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error("Failed to get admin token:", error);
    throw error;
  }
}

async function createRealmAndClient() {
  const token = await getAdminToken();

  try {
    // Create a new realm
    await axios.post(
      `${keycloakUrl}/admin/realms`,
      {
        realm: "my-app-realm",
        enabled: true,
        displayName: "My Application Realm", // Added for clarity
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Realm 'my-app-realm' created.");

    // Create client
    await axios.post(
      `${keycloakUrl}/admin/realms/my-app-realm/clients`,
      {
        clientId: "my-app-client",
        protocol: "openid-connect",
        publicClient: true,
        directAccessGrantsEnabled: true,
        serviceAccountsEnabled: true,
        standardFlowEnabled: true, // Added for OAuth2 authorization code flow
        webOrigins: ["*"], 
        redirectUris: ["*"],
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("Client 'my-app-client' created.");
  } catch (error) {
    console.error("Error creating realm or client:", error.message);
    throw error;
  }
}

async function createRole() {
  const token = await getAdminToken();

  try {
    await axios.post(
      `${keycloakUrl}/admin/realms/my-app-realm/roles`,
      {
        name: "restricted-access-custom-role",
        description: "Role for restricted access",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("Role 'restricted-access-custom-role' created.");
  } catch (error) {
    console.error("Error creating role:", error);
    throw error;
  }
}

async function assignRoleToUser(userId: string) {
  const token = await getAdminToken();

  try {
    const roleResponse = await axios.get(
      `${keycloakUrl}/admin/realms/my-app-realm/roles/restricted-access-custom-role`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    await axios.post(
      `${keycloakUrl}/admin/realms/my-app-realm/users/${userId}/role-mappings/realm`,
      [
        {
          id: roleResponse.data.id,
          name: roleResponse.data.name,
        },
      ],
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log(`Role assigned to user ${userId}`);
  } catch (error) {
    console.error("Error assigning role to user:", error.message)
    throw error;
  }
}


type PseudoUser = {
    id: string // how can the id be optional accorsing to the api docs >:( 
}
// needing this since this is a bit dudu and the cretion of a new user does not returnthe user id :( 
async function getAllUsers(): Promise<PseudoUser[]> {
  const token = await getAdminToken();

  try {
    const response = await axios.get(
      `${keycloakUrl}/admin/realms/my-app-realm/users`,
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          max: 100,  // Number of users to return per page
          first: 0   // Starting index for pagination
        }
      }
    );
    
    console.log("Users retrieved successfully");
    return response.data;
  } catch (error) {
    console.error("Error getting users:", error);
    throw error;
  }
}

async function createUser() {
  const token = await getAdminToken();

  try {
    const response = await axios.post(
      `${keycloakUrl}/admin/realms/my-app-realm/users`,
      {
        username: "example-user",
        enabled: true,
        email: "example-user@example.com",
        firstName: "Example",
        lastName: "User",
        credentials: [
          {
            type: "password",
            value: "password123",
            temporary: false,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("User 'example-user' created.", response.data);
    return response.data.id;
  } catch (error) {
    console.error("Error creating user:", error.message);
  }
}

 async function getUserJWT(username: string, password: string): Promise<string> {
  try {
    const response = await axios.post(
      `${keycloakUrl}/realms/my-app-realm/protocol/openid-connect/token`,
      new URLSearchParams({
        client_id: clientId, 
        username: username, 
        password: password, 
        grant_type: "password",
        scope: "openid"
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log(`JWT retrieved for user: ${username}`);
    return response.data.access_token; // Return the JWT
  } catch (error) {
    console.error(`Failed to retrieve JWT for user ${username}:`, error.message);
    throw error;
  }
}


interface IntrospectionResponse {
  active: boolean;
  [key: string]: any; // Add more fields as needed
}



async function getUserInfo(accessToken: string): Promise<{ name: string | null}> {
  try {
    const formData = new FormData();
    formData.append('token', accessToken);

    const response = await axios.post(
      `${keycloakUrl}/realms/my-app-realm/protocol/openid-connect/userinfo`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    console.log("User Info Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("User Info Error:", error.response?.data || error.message);
    return {name : null}
  }
}


async function setupKeycloak() {
  
    await createRealmAndClient();
    await createRole();
     await createUser();
    const users = await getAllUsers() 
    await assignRoleToUser(users[0].id);
}

async function getToken() {
  const token = await getUserJWT("example-user","password123")
    console.log(token)
    console.log("user",await getUserInfo(token))
    console.log("All services set up successfully");
}

async function setUpServices() {
  try {
    // await createBucket(envManager.get("BUCKET_NAME"))
    await getToken() 
    // await setUpServices()
  } catch (error) {
    console.error("Error setting up services:", error.message);
  }
}

setUpServices()