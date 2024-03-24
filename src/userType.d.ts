type User = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    image_filename?: string | null;
    password: string;
    auth_token?: string | null;
}