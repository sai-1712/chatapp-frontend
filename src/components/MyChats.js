import { AddIcon } from "@chakra-ui/icons";
import { Box, Stack, Text } from "@chakra-ui/layout";
import { useToast } from "@chakra-ui/toast";
import axios from "axios";
import { useEffect, useState } from "react";
import { getSender } from "../config/ChatLogics";
import ChatLoading from "./ChatLoading";
import GroupChatModal from "./miscellaneous/GroupChatModal";
import { Button } from "@chakra-ui/react";
import { ChatState } from "../Context/ChatProvider";
import { connect, StringCodec } from "nats.ws";

const MyChats = ({ fetchAgain, setFetchAgain }) => {
  // NATS Config
  const [connection, setConnection] = useState(undefined);
  const [loggedUser, setLoggedUser] = useState();

  const { selectedChat, setSelectedChat, user, chats, setChats, notification, setNotification } = ChatState();

  const toast = useToast();

  const fetchChats = async () => {
    // console.log(user._id);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      const { data } = await axios.get("/api/chat", config);
      const arrayOfIds = data.map(obj => obj._id);
      // subscirbeToChat(data)
      setChats(data);
    } catch (error) {
      toast({
        title: "Error Occured!",
        description: "Failed to Load the chats",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-left",
      });
    }
  };

  useEffect(() => {
    setLoggedUser(JSON.parse(localStorage.getItem("userInfo")));
    fetchChats();
    // eslint-disable-next-line
  }, [fetchAgain]);

  useEffect(() => {
    if (connection === undefined) {
      const connectToNats = async () => {
        try {
          const natsConnection = await connect({
            servers: "ws://localhost:5050",
          });
          setConnection(natsConnection);
          console.log(natsConnection);
        } catch (err) {
          console.log("Error connecting");
          console.error(err);
        }
      };
      connectToNats();
    }
  }, [connection]);

  useEffect(()=> {
    const subscirbeToChat = async(chats)=>{
      try{
        console.log("in subchats: ", chats);
        if(connection)
        {
          const newSubs = chats.map((chat) => {
            const sub = connection.subscribe("sk."+ chat._id);
            console.log("Subscribed to: ", chat._id);
            return {sub };
          });
          for await (const {sub } of newSubs) {
            console.log("sub : ", sub);
            for await (const m of sub) {
              const msg = StringCodec().decode(m.data);
              const natsobject = JSON.parse(msg)
              console.log("message received in all chats");
              if (!selectedChat || ( selectedChat && selectedChat._id !== natsobject.chatId._id)) {
                // console.log("id's: ", selectedChat._id, natsobject.chatId._id);
                // to send notification
                console.log("notification sent");
                if (!notification.includes(natsobject)) {
                  setNotification([natsobject, ...notification]);
                  setFetchAgain(!fetchAgain);
                }
              }
            }
          }
        }
        else{
          console.log("error for subscription - no connection");
        }
      }
      catch(error){
        console.log("error in subchats");
        console.log(error);
      }
      
  
    }
    subscirbeToChat(chats)
  }, [connection, selectedChat])

  return (
    <Box
      d={{ base: selectedChat ? "none" : "flex", md: "flex" }}
      flexDir="column"
      alignItems="center"
      p={3}
      bg="white"
      w={{ base: "100%", md: "31%" }}
      borderRadius="lg"
      borderWidth="1px"
    >
      <Box
        pb={3}
        px={3}
        fontSize={{ base: "28px", md: "30px" }}
        fontFamily="Work sans"
        d="flex"
        w="100%"
        justifyContent="space-between"
        alignItems="center"
      >
        My Chats
        <GroupChatModal>
          <Button
            d="flex"
            fontSize={{ base: "17px", md: "10px", lg: "17px" }}
            rightIcon={<AddIcon />}
          >
            New Group Chat
          </Button>
        </GroupChatModal>
      </Box>
      <Box
        d="flex"
        flexDir="column"
        p={3}
        bg="#F8F8F8"
        w="100%"
        h="100%"
        borderRadius="lg"
        overflowY="hidden"
      >
        {chats ? (
          <Stack overflowY="scroll">
            {chats.map((chat) => (
              <Box
                onClick={() => setSelectedChat(chat)}
                cursor="pointer"
                bg={selectedChat === chat ? "#38B2AC" : "#E8E8E8"}
                color={selectedChat === chat ? "white" : "black"}
                px={3}
                py={2}
                borderRadius="lg"
                key={chat._id}
              >
                <Text>
                  {!chat.isGroupChat
                    ? getSender(loggedUser, chat.users)
                    : chat.chatName}
                </Text>
                {chat.latestMessage && (
                  <Text fontSize="xs">
                    <b>{chat.latestMessage.sender.name} : </b>
                    {chat.latestMessage.content.length > 50
                      ? chat.latestMessage.content.substring(0, 51) + "..."
                      : chat.latestMessage.content}
                  </Text>
                )}
              </Box>
            ))}
          </Stack>
        ) : (
          <ChatLoading />
        )}
      </Box>
    </Box>
  );
};

export default MyChats;
