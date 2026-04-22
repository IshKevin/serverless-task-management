import { Amplify } from 'aws-amplify'

Amplify.configure({
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
            region: 'eu-west-1', 
            loginWith: {
                email: true,
            }
        }
    },
    API: {
        REST: {
            TaskAPI: {
                endpoint: import.meta.env.VITE_API_ENDPOINT,
                region: 'eu-west-1'
            }
        }
    }
})