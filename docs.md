# Architceture

see the picture in the in the dir


# Design choices

- why js and python and not just one or th other

- i dont like python but flask file upload is dummbproof since there is first class support unlike ine express

# Set up

## Requirements 
- linux distro of choice (my dev env was arch linux but it should work on all other distros too)
- bun 
- docker and dockercimpose
- ports 3000, 8080 and 9000 to be free (using host network since it is easier to debug the services if a problem is encountered)

## How to start
bun run ./setUpServices.ts //uncommnet the commnedted functions if needed
docker-compose up



# Example workflow 
- get a token (input a curl here)
- make a req against the backend using the token (input a curl here)
